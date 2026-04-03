const versionNode = document.getElementById('release-version');
const releaseNotesNode = document.getElementById('release-notes');
const nsisNode = document.getElementById('download-nsis');
const msiNode = document.getElementById('download-msi');

function configureLink(node, url) {
  if (!url) return;
  node.href = url;
  node.classList.remove('is-disabled');
  node.removeAttribute('aria-disabled');
}

async function bootstrapDownloads() {
  try {
    const response = await fetch('./downloads.json', { cache: 'no-store' });
    const config = await response.json();

    versionNode.textContent = config.version
      ? `Latest release: ${config.version}`
      : 'Download links not configured yet';

    configureLink(nsisNode, config.downloads?.nsis || '');
    configureLink(msiNode, config.downloads?.msi || '');

    if (config.releaseNotesUrl) {
      releaseNotesNode.href = config.releaseNotesUrl;
      releaseNotesNode.classList.remove('is-hidden');
    }
  } catch (error) {
    console.error('Failed to load downloads.json', error);
    versionNode.textContent = 'Download links not configured yet';
  }
}

bootstrapDownloads();
