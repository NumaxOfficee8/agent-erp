const { Octokit } = require("@octokit/rest");
const fs = require("fs");
const { execSync } = require("child_process");

async function run() {
  const token = process.env.GITHUB_TOKEN;
  const tag = process.env.TAG_NAME; // e.g. "v0.1.0"
  const version = tag.replace(/^v/, "");
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
  
  if (!token || !tag || !owner || !repo) {
    console.error("Missing required environment variables.");
    process.exit(1);
  }

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
        // Tauri v2 expected keys:
        // - darwin-aarch64 (macOS Apple Silicon)
        // - darwin-x86_64 (macOS Intel)
        // - windows-x86_64 (Windows 64-bit)
        if (packageName.endsWith(".app.tar.gz") && packageName.includes("aarch64")) {
          manifest.platforms["darwin-aarch64"] = { signature, url: downloadUrl };
        } else if (packageName.endsWith(".app.tar.gz") && packageName.includes("x64")) {
          manifest.platforms["darwin-x86_64"] = { signature, url: downloadUrl };
        } else if (packageName.endsWith(".zip") || packageName.endsWith(".nsis.zip")) {
          manifest.platforms["windows-x86_64"] = { signature, url: downloadUrl };
        }
      }
    }
  }

  // 3. Write manifest file
  fs.writeFileSync("update.json", JSON.stringify(manifest, null, 2));
  console.log("Successfully generated update.json:\n", JSON.stringify(manifest, null, 2));
}

run().catch(err => {
  console.error("Error generating manifest:", err);
  process.exit(1);
});
