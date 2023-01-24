<script>
	import DownloadButton from "./DownloadButton.svelte";
	import { _ } from "svelte-i18n";

	import '../public/fonts/BwGradual.css';

	const year = new Date().getUTCFullYear();
</script>

<svelte:head>
	<title>{$_('page_title')}</title>
</svelte:head>

<main>
	<header>
		<a href="https://www.c1st.com/">
			<img src="logo.svg" alt="Servicepos" height="30px">
		</a>
	</header>
	<h1>{$_('page_title')}</h1>
	<p>{$_('lead_message')}</p>
	<DownloadButton/>
	<footer>
		&copy; {year} C 1ST ApS • Kochsgade 31C, 3. sal, 5000 Odense C • CVR: 35802843
	</footer>
</main>

<style global>
	main {
		font-family: 'Bw Gradual', sans-serif;

		width: 1200px;
		margin: 0 auto;
		margin-top: 40px;
	}
	header {
		margin-bottom: 120px;
	}
	footer {
		margin-top: 120px;
	}
</style>
