<script>
    import { onMount } from 'svelte';
    import { _ } from 'svelte-i18n';

    let OS;

    let MACOS_DOWNLOAD_LINK;
    let WINDOWS_DOWNLOAD_LINK;

    const getAssets = async () => {
        const request = await fetch("https://api.github.com/repos/servicepos/printdesk/releases/latest");
        const { assets } = await request.json();
        console.log(assets);

        MACOS_DOWNLOAD_LINK = assets.filter(asset => asset.name.endsWith(".dmg") && asset.name.includes("x64"))[0].browser_download_url;
        WINDOWS_DOWNLOAD_LINK = assets.filter(asset => asset.name.endsWith(".exe"))[0].browser_download_url;
    }

    onMount(() => {
        console.log(navigator.platform);
        if (navigator.platform.startsWith("Mac")) {
            OS = "Mac";
        } else {
            OS = "Windows";
        }

        getAssets();
    });

    const download = () => {
        if (OS === "Mac") {
            window.location.href = MACOS_DOWNLOAD_LINK;
        } else {
            window.location.href = WINDOWS_DOWNLOAD_LINK;
        }
    }

    const downloadOpposite = () => {
        if (OS === "Windows") {
            window.location.href = MACOS_DOWNLOAD_LINK;
        } else {
            window.location.href = WINDOWS_DOWNLOAD_LINK;
        }
    }

    const handleClick = () => {
        download();
    }
</script>

<button role="button" on:click="{handleClick}">
    {$_('download')} {OS}
</button>
<p class="muted">
    <a role="button" href="#" on:click="{downloadOpposite}" class="muted">{$_('download')} {OS === "Mac" ? "Windows" : "Mac"}</a>
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
        background: rgb(18, 18, 180);
    }

    .muted {
        color: #5e5e5e;
    }
</style>
