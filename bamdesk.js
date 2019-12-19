const cmdPromise = require('cmd-promise')
const tmp = require('tmp');
const fs = require('fs');
const os = require('os');
const { app } = require('electron')
const path = require('path')
const log = require('electron-log');
const request = require('request')
const isDev = require('electron-is-dev');
const config = isDev ? require(path.join(__dirname, 'config-dev.json')) : require(path.join(__dirname, 'config.json'));
const { BrowserWindow } = require('electron')
const machineid = require('node-machine-id');
const Store = require('electron-store');
const { spawn } = require('child_process');
const ps = require('ps-node');
var commandExists = require('command-exists');



function run(api="http://127.0.0.1:8888/webbackend/index.php", deviceid="3", secret="xyzzy1234") {

	mustInstallMono.then(install => {
		if (install) {
			/* @TODO install alert */
		} else {
			return isBamdeskRunning();
		}
	}).then(isBamdeskRunning => {

		if (isBamdeskRunning) {
			log.info(`bamdesk running ${isBamdeskRunning}`);
			return false;
		}

		const bamdeskExec = path.join(__dirname, 'assets', 'BamdeskMint.exe').replace('app.asar', 'app.asar.unpacked')
		switch (os.platform()) {
			case 'darwin':
			case 'linux':
				cmd = spawn('mono', [bamdeskExec, api, deviceid, secret]);
				break;
			case 'win32':
				cmd = spawn(bamdeskExec, [api, deviceid, secret]);
				break;
			default:
				log.error('Platform not supported.');
				return;
		}

		cmd.stdout.on('data', (data) => {
		  log.info(`stdout: ${data}`);
		});

		cmd.stderr.on('data', (data) => {
		  log.error(`stdout: ${data}`);
		});

		cmd.on('close', (code) => {
		   log.info('respawing bamdesk in 10s');
		   setTimeout(_=> {
			run(api, deviceid, secret);
		   }, 10000)
		});
	});
}

function isBamdeskRunning() {
	let cmd;
	switch (os.platform()) {
		case 'darwin':
		case 'linux':
			cmd = 'ps';
			break;
		case 'win32':
			cmd = 'tasklist';
			break;
		default:
			throw new Exception('Platform not supported.');
	}
	return cmdPromise(cmd).then(out => {
		return out.stdout.indexOf('BamdeskMint.exe') > -1;
	});
}

function mustInstallMono() {
	if (os.platform() == 'win32') {
		return new Promise((resolve, reject) => {
			resolve(false);
		});
	}
	return commandExists('mono', function(err, commandExists) {
		return !commandExists;
	});
}

module.exports = {
	run
}