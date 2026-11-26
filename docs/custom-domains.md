# Customer domains on a Caddy VPS

Set `CUSTOM_DOMAIN_TARGET` to a hostname you control and point its A record to
the Caddy server's public IPv4 address. Set `CUSTOM_DOMAIN_IPV4` to that address.
Expose Caddy on ports 80 and 443, and connect it to the private network of the
Yeeet app. Give the app the internal hostname `yeeet-app`.

Caddy's on-demand TLS permission endpoint is
`http://yeeet-app:3000/_yeeet/internal/tls-allow`. Caddy appends `?domain=HOST`.
Only the app's private hostname serves this endpoint. If you already use an
on-demand TLS authorization service, have it forward customer hostname checks
to this endpoint. Keep any existing rules for platform hostnames in that service.

Enable on-demand TLS for the HTTPS catch-all and forward requests to the app,
preserving the original Host header. Keep explicit routes for the control plane,
docs, object storage, and the platform site wildcard. Use a persistent Caddy
data volume for certificates.

Users attach a hostname in the Yeeet dashboard or through `yeeet domain add`.
At their DNS provider they add the displayed TXT record and the routing record
(CNAME for a subdomain, A for an apex). Proxying through a CDN that changes the
public DNS answers must be disabled during verification. After checking DNS,
Yeeet authorizes Caddy to obtain a certificate. If the first check still shows
TLS pending, check again after the certificate has been issued. Removing the
hostname revokes routing and permission to obtain or renew its certificate.

Older Railway-managed entries stay attached to their sites. Their owners must
publish the new DNS records and check DNS again before Caddy serves them.
