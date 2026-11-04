export const api = window.api

export function assetUrl(projectId: string | undefined, relativePath: string | undefined): string {
  if (!projectId || !relativePath) return ''
  if (/^(https?|data|blob):/i.test(relativePath)) return relativePath
  const clean = relativePath.replace(/^\/+/, '')
  return `drama-asset://${projectId}/${clean}`
}
