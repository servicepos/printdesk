
const process = require('process');

module.exports = {
	isDev : function() {
		return true || process.mainModule.filename.indexOf('app.asar') === -1;
	}
}