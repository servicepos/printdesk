const cmdPromise = require('cmd-promise')
const os = require('os');
const process = require('process');
const { dialog } = require('electron')
const path = require('path')
const log = require('electron-log');
const isDev = require('electron-is-dev');
const config = isDev ? require(path.join(__dirname, 'config-dev.json')) : require(path.join(__dirname, 'config.json'));
const { spawn } = require('child_process');


let bamdeskProcess = null;
let currentDevice;
let askedForMono = false;
let featureFlags;

/* make sure  a single instance of bamdesk (Payment device driver) is running.
Internet/usb disconnection etc. will kill any running instance.
This will restart bamdesk client if such event occurs */
async function keepAlive(device, ff) {
	featureFlags = ff;
	if (device) {
		try {
			const monoOK = await isMonoOK();
			log.info(`Mono status:`);
			log.info(monoOK)
		} catch (e) {
			/* ask for mono once per instance (do not spam the user) */
			log.error(`Mono failed:`);
			log.error(e);
			if (!askedForMono) {
				dialog.showErrorBox(`Mono missing`, `You must install mono https://www.mono-project.com/download/stable/ to use the payment device driver`);
				askedForMono = true;
			}
			return;
		}
	}

	log.info({bamdeskProcess});
	if (!bamdeskProcess) {
		currentDevice = device;
		await run();
	} else { /* change device state */
		/* device == null means the user has deselected the device in settings. Kill current instance */
		if (device === null) {
			log.info('Device as been deselected by user', 'kill any running instance');
			bamdeskProcess.kill();
		/* device has been change by user, kill current instance. Due to exit-binding, it will respawn with new device settings. */
		} else if (device.id != currentDevice.id || device.ip != currentDevice.ip) {
			log.info('Device changed', 'kill any running instance');
			bamdeskProcess.kill();
		}
		currentDevice = device;
	}
}

/* start bamdesk if not running */
async function run() {

	log.info('Starting instance', currentDevice);

	if (!currentDevice) {
		log.info(`No device selected`);
		bamdeskProcess = null;
		return;
	}

	let bamdeskExec;
	if (featureFlags.bamdesktcp) {
		bamdeskExec = path.join(__dirname, 'assets', 'BamdeskMintTCP.exe').replace('app.asar', 'app.asar.unpacked')
	} else {
		bamdeskExec = path.join(__dirname, 'assets', 'BamdeskMint.exe').replace('app.asar', 'app.asar.unpacked')
	}
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
	const monoPath = `${env['PATH']}:/Library/Frameworks/Mono.framework/Versions/Current/Commands:/Library/Frameworks/Mono.framework/Versions/Current/bin`;
	return {
		...env,
		PATH : monoPath,
	};
}


module.exports = {
	keepAlive,
}
