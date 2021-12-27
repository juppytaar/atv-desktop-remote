const files = {
    "wsserver.py": "import os\nimport sys\nimport json\nimport pyatv\nimport random\nimport asyncio\nfrom pyatv.const import InputAction\nimport websockets\n\nimport logging\nlogger = logging.getLogger('websockets')\nlogger.setLevel(logging.DEBUG)\nlogger.addHandler(logging.StreamHandler())\n\npair = pyatv.pair\nProtocol = pyatv.const.Protocol\n\n\nmy_name = os.path.basename(sys.argv[0])\n\nloop = asyncio.get_event_loop()\nscan_lookup = {}\npairing_atv = False\nactive_pairing = False\nactive_device = False\nactive_remote = False\ndefault_port = 8765\n\nasync def sendCommand (ws, command, data=[]):\n    r = {\"command\": command, \"data\": data}\n    await ws.send(json.dumps(r))\n\nasync def parseRequest(j, websocket):\n    global scan_lookup, pairing_atv, active_pairing, active_device, active_remote\n    \n    if \"cmd\" in j.keys():\n        cmd = j[\"cmd\"]\n    else:\n        return\n    \n    data = False\n    if \"data\" in j.keys():\n        data = j[\"data\"]\n    \n    if cmd == \"quit\":\n        print (\"quit command\")\n        await asyncio.sleep(0.5)\n        sys.exit(0)\n        return\n    \n    if cmd == \"scan\":\n        atvs = await pyatv.scan(loop)\n        ar = []\n        scan_lookup = {}\n        for atv in atvs:\n            txt = f\"{atv.name} ({atv.address})\"\n            ar.append(txt)\n            scan_lookup[txt] = atv\n\n        await sendCommand(websocket, \"scanResult\", ar)\n\n    if cmd == \"echo\":\n        await sendCommand(websocket, \"echo_reply\", data)\n\n    if cmd == \"startPair\":\n        print (\"startPair\")\n        atv = scan_lookup[data]\n        pairing_atv = atv\n        print (\"pairing atv %s\" % (atv))\n        pairing = await pair(atv, Protocol.AirPlay, loop)\n        active_pairing = pairing\n        await pairing.begin()\n    \n    if cmd == \"finishPair\":\n        print(\"finishPair %s\" % (data))\n        pairing = active_pairing\n        pairing.pin(data)\n        await pairing.finish()\n        if pairing.has_paired:\n            print(\"Paired with device!\")\n            print(\"Credentials:\", pairing.service.credentials)\n        else:\n            print(\"Did not pair with device!\")\n        creds = pairing.service.credentials\n        id = pairing_atv.identifier\n        nj = {\"credentials\": creds, \"identifier\": id}\n        await sendCommand(websocket, \"pairCredentials\", nj)\n    \n    if cmd == \"connect\":\n        id = data[\"identifier\"]\n        creds = data[\"credentials\"]\n        stored_credentials = { Protocol.AirPlay: creds }\n        print (\"stored_credentials %s\" % (stored_credentials))\n        atvs = await pyatv.scan(loop, identifier=id)\n        atv = atvs[0]\n        for protocol, credentials in stored_credentials.items():\n            print (\"Setting protocol %s with credentials %s\" % (str(protocol), credentials))\n            atv.set_credentials(protocol, credentials)\n        try:\n            device = await pyatv.connect(atv, loop)\n            remote = device.remote_control\n            active_device = device\n            active_remote = remote\n            await sendCommand(websocket, \"connected\")\n        except Exception as ex:\n            print (\"Failed to connect\")\n            await sendCommand(websocket, \"connection_failure\")\n    \n    if cmd == \"is_connected\":\n        ic = \"true\" if active_remote else \"false\"\n        await sendCommand(websocket, \"is_connected\", ic)\n        #await active_remote.menu()\n    \n    if cmd == \"key\":\n        valid_keys = ['play_pause', 'left', 'right', 'down', 'up', 'select', 'menu', 'top_menu', 'home', 'home_hold', 'skip_backward', 'skip_forward', 'volume_up', 'volume_down']\n        no_action_keys = ['volume_up', 'volume_down', 'play_pause', 'home_hold']\n        #taction = InputAction[\"SingleTap\"]\n        taction = False\n        key = data\n        if not isinstance(data, str):\n            key = data['key']\n            taction = InputAction[data['taction']]\n    \n        if key in valid_keys:\n            if key in no_action_keys or (not taction):\n                r = await getattr(active_remote, key)()\n            else:\n                r = await getattr(active_remote, key)(taction)\n            print (r)\n\nasync def close_active_device():\n    try:\n        if active_device:\n            await active_device.close()\n    except Exception as ex:\n        print (\"Error closing active_device: %s\" %(ex))\n\nasync def reset_globals():\n    global scan_lookup, pairing_atv, active_pairing, active_device, active_remote\n    print (\"Resetting global variables\")\n    scan_lookup = {}\n    \n    pairing_atv = False\n    active_pairing = False\n    active_device = False\n    active_remote = False\n\nkeep_running = True\n\n\nasync def check_exit_file():\n    global keep_running\n    if os.path.exists('stopserver'):\n        os.unlink('stopserver')\n\n    while keep_running:\n        await asyncio.sleep(0.5)\n        fe = os.path.exists('stopserver')\n        txt = \"found\" if fe else \"not found\"\n        #print (\"stopserver %s\" % (txt), flush=True)\n        if fe:\n            print (\"exiting\")\n            keep_running = False\n            os.unlink('stopserver')\n            sys.exit(0)\n\n\nasync def ws_main(websocket):\n    #await reset_globals()\n    await close_active_device()\n    async for message in websocket:\n        try:\n            j = json.loads(message)\n        except Exception as ex:\n            print (\"Error parsing message: %s\\n%s\" % (str(ex), message))\n            continue\n        \n        await parseRequest(j, websocket)\n\nasync def main(port):\n    global keep_running\n    width = 80\n    txt = \"%s WebSocket - ATV Server\" % (my_name)\n    print (\"=\"*width)\n    print (txt.center(width))\n    print (\"=\"*width)\n    task = asyncio.create_task(check_exit_file())\n\n    async with websockets.serve(ws_main, \"localhost\", port):\n        try:\n            # while keep_running:\n            #     await asyncio.sleep(1)\n            await asyncio.Future()  # run forever\n        except Exception as ex:\n            print (ex)\n            sys.exit(0)\n\n\n\nif __name__ == \"__main__\":\n    args = sys.argv[1:]\n    port = default_port\n    if len(args) > 0:\n        if args[0] in [\"-h\", \"--help\", \"-?\", \"/?\"]:\n            print (\"Usage: %s (port_number)\\n\\n Port number by default is %d\" % (my_name, default_port))\n        port = int(args[0])\n\n    asyncio.set_event_loop(loop)\n    loop.run_until_complete(main(port))\n\n",
    "start_server.bat": "@echo off \r\ncd \"%~dp0\"\r\npython -m pip install --user pyatv websockets\r\npython wsserver.py",
    "start_server.sh": "#!/bin/bash\nMY_PATH=$(dirname \"$0\")\ncd \"$MY_PATH\"\nfunction kill_proc () {\nfor p in $(ps ax | grep -v grep | grep wsserver.py | awk '{print $1}'); do\n    echo \"Killing $p\"\n    kill $1 $p\ndone\n}\nkill_proc\nkill_proc \"-9\"\npython -m pip install -q --user websockets pyatv\npython wsserver.py\n"
};

exports.files = files;
