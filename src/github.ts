import type { Post, SiteSettings } from "./types";

export const repoOwner = import.meta.env.VITE_REPO_OWNER || "";
export const repoName = import.meta.env.VITE_REPO_NAME || "";
export const repoConfigured = Boolean(repoOwner && repoName);
const apiRoot = `https://api.github.com/repos/${encodeURIComponent(repoOwner)}/${encodeURIComponent(repoName)}`;

export const asset = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

async function githubFetch(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const reason = response.status === 401 ? "令牌无效或已过期" : response.status === 403 ? "令牌没有此仓库的内容写入权限" : response.status === 404 ? "找不到仓库，请检查令牌的仓库权限" : response.status === 409 ? "文章已被其他操作更新，请刷新后重试" : `GitHub 返回 ${response.status}`;
    throw new Error(reason);
  }
  return data;
}

export async function connectGitHub(token: string): Promise<string> {
  if (!repoConfigured) throw new Error("尚未绑定 GitHub 仓库");
  const user = await githubFetch("https://api.github.com/user", token);
  const repo = await githubFetch(apiRoot, token);
  if (!repo.permissions?.push) throw new Error("此账号没有仓库写入权限");
  return user.login as string;
}

function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

async function getFile(path: string, token: string): Promise<{ sha: string; content: string }> {
  const file = await githubFetch(`${apiRoot}/contents/${path}?ref=main`, token);
  if (file.type !== "file" || !file.content || !file.sha) throw new Error("无法读取仓库内容");
  return { sha: file.sha, content: decodeBase64(file.content) };
}

async function writeFile(path: string, content: string, sha: string, token: string, message: string) {
  await githubFetch(`${apiRoot}/contents/${path}`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: encodeBase64(content), sha, branch: "main" }),
  });
}

export async function publishPost(post: Post, token: string): Promise<Post[]> {
  const file = await getFile("public/content/posts.json", token);
  const posts = JSON.parse(file.content) as Post[];
  if (!Array.isArray(posts)) throw new Error("仓库文章数据格式不正确");
  const index = posts.findIndex(item => item.id === post.id);
  if (index < 0) posts.unshift(post);
  else posts[index] = post;
  await writeFile("public/content/posts.json", `${JSON.stringify(posts, null, 2)}\n`, file.sha, token, `Publish: ${post.title}`);
  return posts;
}

export async function deletePost(id: string, token: string): Promise<Post[]> {
  const file = await getFile("public/content/posts.json", token);
  const posts = JSON.parse(file.content) as Post[];
  if (!Array.isArray(posts)) throw new Error("仓库文章数据格式不正确");
  const next = posts.filter(post => post.id !== id);
  await writeFile("public/content/posts.json", `${JSON.stringify(next, null, 2)}\n`, file.sha, token, `Delete post: ${id}`);
  return next;
}

export async function saveSettings(settings: SiteSettings, token: string): Promise<void> {
  const file = await getFile("public/content/site.json", token);
  await writeFile("public/content/site.json", `${JSON.stringify(settings, null, 2)}\n`, file.sha, token, "Update blog introduction");
}

export async function loadPublicData(): Promise<{ posts: Post[]; settings: SiteSettings }> {
  const [postResponse, settingResponse] = await Promise.all([
    fetch(asset("content/posts.json"), { cache: "no-store" }),
    fetch(asset("content/site.json"), { cache: "no-store" }),
  ]);
  if (!postResponse.ok || !settingResponse.ok) throw new Error("文章暂时无法加载，请稍后刷新");
  const [posts, settings] = await Promise.all([postResponse.json(), settingResponse.json()]);
  if (!Array.isArray(posts) || typeof settings?.heroTitle !== "string" || typeof settings?.heroSubtitle !== "string") throw new Error("博客数据格式不正确");
  return { posts: posts as Post[], settings: settings as SiteSettings };
}
