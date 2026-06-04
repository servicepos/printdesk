<script>
    import { onMount } from 'svelte';
    import { _ } from 'svelte-i18n';

    let OS;

    let MACOS_DOWNLOAD_LINK;        // Apple Silicon (arm64) — default on Mac
    let MACOS_INTEL_DOWNLOAD_LINK;  // Intel (x64) — fallback
    let WINDOWS_DOWNLOAD_LINK;

    const getAssets = async () => {
        const request = await fetch("https://api.github.com/repos/servicepos/printdesk/releases/latest");
        const { assets } = await request.json();

        MACOS_DOWNLOAD_LINK = assets.filter(asset => asset.name.endsWith(".dmg") && asset.name.includes("arm64"))[0].browser_download_url;
        MACOS_INTEL_DOWNLOAD_LINK = assets.filter(asset => asset.name.endsWith(".dmg") && asset.name.includes("x64"))[0].browser_download_url;
        WINDOWS_DOWNLOAD_LINK = assets.filter(asset => asset.name.endsWith(".exe"))[0].browser_download_url;
    }

    onMount(() => {
        if (navigator.platform.startsWith("Mac")) {
            OS = "Mac";
        } else {
            OS = "Windows";
        }

        getAssets();
    });

    const go = (url) => { if (url) window.location.href = url; };

    const handleClick = () => {
        if (OS === "Mac") {
            go(MACOS_DOWNLOAD_LINK);
        } else {
            go(WINDOWS_DOWNLOAD_LINK);
        }
    }
</script>

<button role="button" on:click="{handleClick}">
    {$_('download')} {OS}
</button>
<p class="muted">
    {#if OS === "Mac"}
        <a role="button" href="#" on:click|preventDefault="{() => go(MACOS_INTEL_DOWNLOAD_LINK)}" class="muted">{$_('download')} Mac (Intel)</a><br />
        <a role="button" href="#" on:click|preventDefault="{() => go(WINDOWS_DOWNLOAD_LINK)}" class="muted">{$_('download')} Windows</a>
    {:else}
        <a role="button" href="#" on:click|preventDefault="{() => go(MACOS_DOWNLOAD_LINK)}" class="muted">{$_('download')} Mac</a>
    {/if}
</p>

<style>
    button {
        background: rgb(0,0,255);
        color: #fff;
        display: inline-block;
        padding: 16px 40px;
        border: 0;
        font-size: 14pt;
        line-height: 32px;
        font-family: "Bw Gradual", sans-serif;
        border-radius: 40px;
        cursor: pointer;
    }
    button:hover {
        background: rgb(0, 0, 200);
    }

    .muted {
        color: #5e5e5e;
    }
</style>
