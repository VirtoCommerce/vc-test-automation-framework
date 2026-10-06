const PINNED_REPOSITORY_URL =
  "https://raw.githubusercontent.com/VirtoCommerce/vc-testing-module/08b9d932b5c988d23b551ba8da1e4e2a0ad0b498";

export const REMOTE_FILES = {
  markdown: { name: "README.md", url: `${PINNED_REPOSITORY_URL}/README.md` },
  dotfile: { name: ".gitignore", url: `${PINNED_REPOSITORY_URL}/.gitignore` },
} as const;
