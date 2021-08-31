import {
	init,
	getLocaleFromNavigator, addMessages
} from "svelte-i18n";
import App from './App.svelte';

import en from '../locale/en.json';
import da from '../locale/da.json';

addMessages('en', en);
addMessages('da', da);

init({
	fallbackLocale: 'en',
	initialLocale: getLocaleFromNavigator()
});

const app = new App({
	target: document.body
});

export default app;
