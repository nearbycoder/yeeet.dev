# @yeeet.dev/cli

Deploy a folder of static assets to a globally cached `*.site.yeeet.dev` URL.

```sh
npm install --global @yeeet.dev/cli
yeeet login
yeeet deploy ./dist
```

Omit `--name` for a generated subdomain, or keep a stable site name across releases:

```sh
yeeet deploy ./dist --name my-site
yeeet versions my-site
yeeet rollback my-site <deployment-id>
```

Single-page app fallback is enabled by default, so refreshing a client-side route
serves `index.html`. Use `--static` for strict file-only routing.

Password protect a new deployment while still giving reviewers a one-click
link that needs no Yeeet account or password:

```sh
export YEEET_DEPLOY_PASSWORD='a long private password'
yeeet deploy ./dist --name my-site
yeeet share my-site
```

Access can be changed later, and share links can be revoked without uploading
the files again:

```sh
yeeet access protect my-site <version> --password 'a new password'
yeeet access rotate-link my-site <version>
yeeet access public my-site <version>
```

Remove one version or the complete site directly:

```sh
yeeet version remove my-site <version> --yes
yeeet remove my-site --yes
```

Custom domains can be managed without leaving the terminal:

```sh
yeeet domain add my-site www.example.com
yeeet domain list my-site
yeeet domain refresh my-site www.example.com
yeeet domain remove my-site www.example.com
```

Run `yeeet --help` or `yeeet <command> --help` for the complete command reference.

## Self-hosted instances

The CLI defaults to `https://yeeet.dev`. Point it at another Yeeet control plane
with either form:

```sh
yeeet --api https://deploy.example.com login
YEEET_API=https://deploy.example.com yeeet deploy ./dist
```

The selected API URL is saved alongside the browser-login session. Automation
can combine `YEEET_API` with `YEEET_TOKEN` and `--json`.

Source, deployment documentation, and the MIT license are available in the
[Yeeet repository](https://github.com/nearbycoder/yeeet.dev).
