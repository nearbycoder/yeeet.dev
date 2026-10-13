// Social metadata needs absolute URLs, so routes pass the configured origin.
export type SocialCard = {
  origin: string
  path: string
  title: string
  description: string
  image: string
  imageAlt: string
}

export const SOCIAL_IMAGE_WIDTH = 1200
export const SOCIAL_IMAGE_HEIGHT = 630

export function socialMeta(card: SocialCard) {
  const url = new URL(card.path, card.origin).href
  const image = new URL(card.image, card.origin).href
  return [
    { title: card.title },
    { name: 'description', content: card.description },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'Yeeet' },
    { property: 'og:title', content: card.title },
    { property: 'og:description', content: card.description },
    { property: 'og:url', content: url },
    { property: 'og:image', content: image },
    { property: 'og:image:type', content: 'image/png' },
    { property: 'og:image:width', content: String(SOCIAL_IMAGE_WIDTH) },
    { property: 'og:image:height', content: String(SOCIAL_IMAGE_HEIGHT) },
    { property: 'og:image:alt', content: card.imageAlt },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: card.title },
    { name: 'twitter:description', content: card.description },
    { name: 'twitter:image', content: image },
    { name: 'twitter:image:alt', content: card.imageAlt },
  ]
}

export function canonicalLink(origin: string, path: string) {
  return { rel: 'canonical', href: new URL(path, origin).href }
}
