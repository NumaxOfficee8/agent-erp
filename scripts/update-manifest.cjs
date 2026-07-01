const { Octokit } = require("@octokit/rest");
const fs = require("fs");

async function run() {
  const token = process.env.GITHUB_TOKEN;
  const tag = process.env.TAG_NAME; // e.g. "v0.1.0"
  const repoFullName = process.env.GITHUB_REPOSITORY;
  
  if (!token || !tag || !repoFullName) {
    console.error("Missing required environment variables.");
    process.exit(1);
  }

  const [owner, repo] = repoFullName.split("/");
  const version = tag.replace(/^v/, "");

  console.log(`Fetching release assets for tag: ${tag} (${owner}/${repo})...`);
  const octokit = new Octokit({ auth: token });
  
  // 1. Get release details by tag
  const { data: release } = await octokit.rest.repos.getReleaseByTag({
    owner,
    repo,
    tag,
  });

  const manifest = {
    version,
    notes: release.body || `AgentERP release ${tag}`,
    pub_date: release.published_at,
    platforms: {},
  };

  const assets = release.assets;
  console.log(`Found ${assets.length} assets. Downloading signature files...`);

  // 2. Iterate assets to find signature (.sig) files and read their base64 string
  for (const asset of assets) {
    if (asset.name.endsWith(".sig")) {
      const packageName = asset.name.replace(".sig", "");
      const packageAsset = assets.find(a => a.name === packageName);

      if (packageAsset) {
        console.log(`Downloading signature for: ${packageName}...`);
        
        // Fetch signature file buffer
        const response = await octokit.rest.repos.getReleaseAsset({
          owner,
          repo,
          asset_id: asset.id,
          headers: { accept: "application/octet-stream" },
        });

        // Convert signature buffer to utf-8 text string
        const signature = Buffer.from(response.data).toString("utf-8").trim();
        const downloadUrl = packageAsset.browser_download_url;

        // Map signatures to Tauri expected platform keys
        if (packageName.endsWith(".app.tar.gz") && packageName.includes("aarch64")) {
          manifest.platforms["darwin-aarch64"] = { signature, url: downloadUrl };
        } else if (packageName.endsWith(".app.tar.gz") && packageName.includes("x64")) {
          manifest.platforms["darwin-x86_64"] = { signature, url: downloadUrl };
        } else if (
          packageName.endsWith(".zip") ||
          packageName.endsWith(".nsis.zip") ||
          packageName.endsWith(".msi") ||
          packageName.endsWith(".exe")
        ) {
          const current = manifest.platforms["windows-x86_64"];
          const isBetterFormat = packageName.endsWith(".msi") || packageName.endsWith(".zip") || packageName.endsWith(".nsis.zip");
          if (!current || isBetterFormat) {
            manifest.platforms["windows-x86_64"] = { signature, url: downloadUrl };
          }
        }
      }
    }
  }

  // 3. Write updater manifest file
  fs.writeFileSync("update.json", JSON.stringify(manifest, null, 2));
  console.log("Successfully generated update.json:\n", JSON.stringify(manifest, null, 2));

  // 4. Write install manifest file (direct download links for users/landing portals)
  const installManifest = {
    version,
    pub_date: release.published_at,
    installers: {
      "mac-dmg-aarch64": assets.find(a => a.name.endsWith(".dmg") && a.name.includes("aarch64"))?.browser_download_url || "",
      "mac-dmg-x64": assets.find(a => a.name.endsWith(".dmg") && a.name.includes("x64"))?.browser_download_url || "",
      "windows-msi": assets.find(a => a.name.endsWith(".msi"))?.browser_download_url || "",
      "windows-exe": assets.find(a => a.name.endsWith(".exe") && !a.name.endsWith(".sig"))?.browser_download_url || ""
    }
  };
  fs.writeFileSync("install.json", JSON.stringify(installManifest, null, 2));
  console.log("Successfully generated install.json:\n", JSON.stringify(installManifest, null, 2));
}

run().catch(err => {
  console.error("Error generating manifest:", err);
  process.exit(1);
});
