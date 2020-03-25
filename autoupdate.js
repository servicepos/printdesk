const log = require('electron-log');
const electron = require('electron')

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