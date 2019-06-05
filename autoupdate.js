const log = require('electron-log');
const electron = require('electron')
const autoUpdater = electron.autoUpdater

log.info('auto update loaded');


autoUpdater.on('error', (ev, err) => {
	log.info(err);
})

autoUpdater.once('checking-for-update', (ev, err) => {
	log.info('Checking for updates');
})

autoUpdater.once('update-available', (ev, err) => {
	log.info('Update available. Downloading');
})

autoUpdater.once('update-not-available', (ev, err) => {
	log.info('Update not available');
})

autoUpdater.once('update-downloaded', (ev, err) => {
	log.info('Update downloaded');
})

autoUpdater.checkForUpdates()