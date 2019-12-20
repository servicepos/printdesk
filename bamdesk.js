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

let process;
let currentDevice;

function assertRunning(device) {

	if (!device) {
		process && process.kill();
	}

	if (!currentDevice || device.deviceid != currentDevice.id) {
		currentDevice = device;

		log.info('Device changed', 'restarting instance');

		process.kill();

		isBamdeskRunning().then(running => {
			if (running) {
				log.info(`bamdesk already running`);
				return false;
			} else {
				return mustInstallMono();
			}
		}).then(mustInstall => {

			if (mustInstall) {
				/* @must install */
				return false;
			}

			process = startInstance(api, deviceid, secret);

			const bamdeskExec = path.join(__dirname, 'assets', 'BamdeskMint.exe').replace('app.asar', 'app.asar.unpacked')
			switch (os.platform()) {
				case 'darwin':
				case 'linux':
					process = spawn('mono', [bamdeskExec, api, deviceid, secret]);
					break;
				case 'win32':
					process = spawn(bamdeskExec, [api, deviceid, secret]);
					break;
				default:
					log.error('Platform not supported.');
					return;
			}

			process.stdout.on('data', (data) => {
			  //log.info(`stdout: ${data}`);
			});

			process.stderr.on('data', (data) => {
			  log.error(`stdout: ${data}`);
			});

		});
	}
}



function startInstance(api, deviceid, secret) {

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
	return new Promise((resolve, reject) => {
		commandExists('mono', function(err, commandExists) {
			resolve(!commandExists);
		});
	});
}


/** expires  */
function migrateFromOldBamdeskInstallation() {
	let file;
	switch (os.platform()) {
		case 'darwin':
			file = '/Application/bamdesk/Bamdesk.exe';
			break;
		case 'win32':
			file = '';
			break;
		default:
			throw new Exception('Platform not supported.');
	}

	const contents = fs.readFileSync(file, 'utf8');



}

module.exports = {
	run, kill
}