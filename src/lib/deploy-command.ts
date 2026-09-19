import type { DeploymentSettings } from './deployment-presets'

export function shellQuote(value: string) {
  return "'" + value.replaceAll("'", "'\"'\"'") + "'"
}
export function deployCommand(api: string, settings: DeploymentSettings) {
  const args = [
    'yeeet',
    '--api',
    shellQuote(api),
    'deploy',
    shellQuote('./your-build-folder'),
    '--dry-run',
    settings.spaFallback ? '--spa' : '--static',
  ]
  if (settings.slug) args.push('--name', shellQuote(settings.slug))
  if (settings.channel) args.push('--channel', shellQuote(settings.channel))
  if (settings.privateDeploy)
    args.push(
      '--password',
      '"${YEEET_DEPLOY_PASSWORD:?Set YEEET_DEPLOY_PASSWORD first}"',
    )
  return args.join(' ')
}
