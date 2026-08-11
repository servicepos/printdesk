const log = require('electron-log');
const electron = require('electron')
const isDev = require('electron-is-dev');

// Set PRINTDESK_DISABLE_UPDATER=1 to launch a build without the updater, e.g.
// when verifying a release candidate. Use this instead of commenting out the
// code below, so the build under test stays identical to the published one.
if (isDev || process.env.PRINTDESK_DISABLE_UPDATER) {
	log.info(`auto update disabled (isDev=${isDev}, PRINTDESK_DISABLE_UPDATER=${process.env.PRINTDESK_DISABLE_UPDATER || 'unset'})`);
	return;
}

require('update-electron-app')({
	logger: log,
	updateInterval: '5 minutes',
	repo: 'servicepos/printdesk',
})

electron.autoUpdater.once('update-downloaded', (ev, err) => {
	log.info('App updated');
	log.info(ev)
	err && log.error(err)
	electron.autoUpdater.quitAndInstall();
})

electron.autoUpdater.once('checking-for-update', (ev) => {
	log.info('checking-for-update');
	log.info(ev)
})

electron.autoUpdater.once('error', (error) => {
	log.error('Auto update error');
	log.error(error)
})
