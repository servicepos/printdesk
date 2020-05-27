const cmdPromise = require('cmd-promise')
const tmp = require('tmp');
const fs = require('fs');
const os = require('os');
const process = require('process');
const { app, dialog } = require('electron')
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

let bamdeskProcess;
let currentDevice;
let askedForMono = false;

/* make sure extacly a single instance of bamdesk (Dankort device driver) is running.
Internet/usb disconnection etc. will kill any running instance.
This will restart bamdesk client if such event occour */
async function keepAlive(device) {
	if (device) {
		try {
			const monoOK = await isMonoOK();
			log.info(`Mono ok: ${monoOK}`);
		} catch (e) {
			/* ask for mono once per instane (do not spam the user) */
			log.error(`Mono failed: ${e}`);

			if (!askedForMono) {
				dialog.showErrorBox(`Mono missing`, `You must install mono https://www.mono-project.com/download/stable/ to use the payment device driver`);
				askedForMono = true;
			}
			return;
		}
	}

	if (!bamdeskProcess) {
		/* initiaite */
		try {
			/* kill any uninstall any legacy bamdesk, if a device is select using the now method */
			if (device) {
				killLegacyBamdesk();
				renameLegacyBamdesk();
			}
		} catch (e) {
			/* no legacy bamdesk was running, just continue */
		}
		currentDevice = device;
		await run();
	} else { /* change device state */
		/* device == null means the user has deselected the device in settings. Kill current instance */
		if (device === null) {
			log.info('Device as been deselected by user', 'kill any running instance');
			bamdeskProcess.kill();
		/* device has been change by user, kill currenct instance. It will state again with the new device since device is non-null */
		} else if (device.id != currentDevice.id) {
			/* if user has changed device in settings. */
			log.info('Device changed', 'kill any running instance');
			bamdeskProcess.kill();
		}
		currentDevice = device;
	}
}

/* start bamdesk if not running */
async function run() {

	if (!currentDevice) {
		log.info(`No device selected`);
		bamdeskProcess = null;
		return;
	}

	const running = await isBamdeskRunning();

	if (running) {
		log.info(`bamdesk already running`);
		return false;
	}


	log.info('Starting instance', currentDevice);

	const bamdeskExec = path.join(__dirname, 'assets', 'BamdeskMint.exe').replace('app.asar', 'app.asar.unpacked')
	const url = `${config.servicepos_url}/webbackend/index.php`;
	let cmdparams = [url, currentDevice.id, currentDevice.secretkey]
	if (currentDevice.ip) {
		cmdparams.push(currentDevice.ip);
	}
	log.info(`Bamdesk exe: ${bamdeskExec}`);
	switch (os.platform()) {
		case 'darwin':
		case 'linux':
			const options = {
				env : monoEnv(),
			}
			bamdeskProcess = spawn('mono', [bamdeskExec, ...cmdparams], options);
			break;
		case 'win32':
			bamdeskProcess = spawn(bamdeskExec, cmdparams);
			break;
		default:
			log.error('Platform not supported.');
			return;
	}

	log.info('Bamdesk cmd:', [bamdeskExec, url, currentDevice.id, currentDevice.secretkey, '1', currentDevice.ip].join(' '));

	bamdeskProcess.stdout.on('data', (data) => {
		log.info(`Bamdesk:`);
		log.info(data && data.toString());
	});

	bamdeskProcess.stderr.on('data', (data) => {
		log.error(`Bamdesk:`);
		log.error(data && data.toString())
	});

	/* restart bamdesk if it exits. USB connection lost, kill() due to change of deviceid, etc. */
	bamdeskProcess.on('exit', (data) => {
		log.info('Bamdesk exit:');
		log.info(data && data.toString());
		run();
	});
}

function killLegacyBamdesk() {
	let cmd;
	switch (os.platform()) {
		case 'darwin':
		case 'linux':
			cmd = 'killall mono';
			break;
		case 'win32':
			cmd = 'taskkill /im Bamdesk.exe';
			break;
		default:
			throw new Exception('Platform not supported.');
	}
	log.info(`Kill any legacy bamdesk ${cmd}`);
	const timeout = 1000;
	cmdPromise(cmd, {}, {timeout}).then(e => log.info, log.error);
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
		log.info(`ps: ${out.stdout}`);
		return out.stdout.indexOf('BamdeskMint.exe') > -1 || out.stdout.indexOf('Bamdesk.exe') > -1;
	});
}

function isMonoOK() {
	if (os.platform() == 'win32') {
		return new Promise((resolve, reject) => {
			resolve(true);
		});
	}
	const options = { env : monoEnv() };
	log.info('Looking for mono with env');
	log.info({options});
	return new cmdPromise('mono -V', {}, options);
}

function monoEnv() {
	const env = process.env;
	const monoPath = `${env['PATH']}:/Library/Frameworks/Mono.framework/Versions/Current/Commands`;
	return {
		...env,
		PATH : monoPath,
	};
}


/** expires  */
function renameLegacyBamdesk() {
	log.info('rename legacy bamdesk');
	try {
		switch (os.platform()) {
			case 'darwin':
				const from = '/Applications/bamdesk';
				const to = '/Applications/bamdesk_legacy';
				log.info('Rename', {to, from});
				fs.renameSync(from, to);
				break;
			case 'win32':
				const cmd = `schtasks /CHANGE /tn "ServicePOS bamdesk" /DISABLE`;
				log.info('disable cron:', cmd);
				cmdPromise(cmd).then(e => log.info('Ok removed schtasks',e), log.error);
				break;
			default:
				throw new Exception('Platform not supported.');
		}
	} catch (e) {
		log.error('Error remiving legacy bamdesk', e);
	}
}

module.exports = {
	keepAlive,
}