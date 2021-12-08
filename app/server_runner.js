const spawn = require('child_process').spawn
const exec = require('child_process').exec
const readline = require('readline')
const fs = require('fs')
const fsp = fs.promises
const EventEmitter = require('events');

var server_events = new EventEmitter();
var proc = false;

var showOutputs = false;
var serverRunning = false;

function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

function _announceServerStart() {
    // debounce to allow multiple interfaces to bind
    serverRunning = true;
    server_events.emit("started");
    console.log(`Server started ${proc.pid}`)
}

var announceServerStart = debounce(_announceServerStart, 200);

function testPythonExists() {
    return new Promise((resolve, reject) => {
        exec("python -V", (err, stdout, stderr) => {
            if (err) return reject(err);
            resolve(stdout);
        })
    })
}

async function pythonExists() {
    try {
        var r = await testPythonExists();
        return true;
    } catch (err) {
        return false;
    }
}


function parseLine(streamName, line) {
    if (!serverRunning && line.indexOf("server listening on") > -1) {
        announceServerStart();
    }
    if (showOutputs) console.log(`SERVER.${streamName}: ${line}`)
}

function stopServer() {
    console.log('stopServer');
    serverRunning = false;
    if (proc && !proc.killed) {
        try {
            proc.removeAllListeners();
        } catch (e) {}
        try {
            proc.kill()
        } catch (e) {}
        setImmediate(() => {
            try {
                if (!proc.killed) proc.kill('SIGINT');
            } catch (e) {}
            proc = false;
        })
    }
}

var totalRuns = 100;
var watchServerInterval;

function startServer() {
    stopServer();
    // watchServerInterval = setInterval(() => {
    //     console.log(`isServerRunning: ${isServerRunning()}`)
    //     totalRuns -= 1
    //     if (totalRuns <= 0) clearInterval(watchServerInterval);
    // }, 100)
    proc = spawn("/Users/brianharper/Projects/atv-desktop-remote/pytest/start_server.sh", { detached: false })
    var stdout = readline.createInterface({ input: proc.stdout });
    var stderr = readline.createInterface({ input: proc.stderr });

    stdout.on("line", line => {
        parseLine("stdout", line);
    })

    stderr.on("line", line => {
        parseLine("stderr", line)
    })

    proc.on('exit', (code, signal) => {
        serverRunning = false;
        server_events.emit("stopped", code);
        console.log(`Server exited with code ${code}`)
    });

}

function setShowOutputs(tf) {
    showOutputs = !!(tf)
}

function isServerRunning() {
    return serverRunning;
}

function getProc() {
    return proc;
}

process.on("beforeExit", () => {
    stopServer();
})


async function main() {
    var tf = await pythonExists()
    console.log(`python exists: ${tf}`)
    server_events.on("started", () => {
        console.log('Woohoo, we are up and running');
    });
    startServer();
}


if (require.main === module) {
    (async() => {
        main();
    })();
}

exports.getProc = getProc;
exports.setShowOutputs = setShowOutputs;
exports.showOutputs = showOutputs;
exports.startServer = startServer;
exports.stopServer = stopServer;
exports.server_events = server_events;
exports.pythonExists = pythonExists;
exports.testPythonExists = testPythonExists;
exports.isServerRunning = isServerRunning;