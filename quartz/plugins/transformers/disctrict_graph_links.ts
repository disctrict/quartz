import { QuartzTransformerPlugin } from "../types"
import {
  FullSlug,
  RelativeURL,
  SimpleSlug,
  TransformOptions,
  stripSlashes,
  simplifySlug,
  splitAnchor,
  transformLink,
} from "../../util/path"
import { visitParents } from 'unist-util-visit-parents'
import isAbsoluteUrl from "is-absolute-url"
import { Root } from "hast"

interface Options {
  /** How to resolve Markdown paths */
  markdownLinkResolution: TransformOptions["strategy"]
  /** Strips folders from a link so that it looks nice */
  prettyLinks: boolean
  openLinksInNewTab: boolean
  lazyLoad: boolean
  externalLinkIcon: boolean
  targetClass : string
}

const defaultOptions: Options = {
  markdownLinkResolution: "absolute",
  prettyLinks: true,
  openLinksInNewTab: false,
  lazyLoad: false,
  externalLinkIcon: true,
}

export const CrawlDisctrictGraphLinks: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  return {
    name: "DisctrictGraphLinkProcessing",
    htmlPlugins(ctx) {
      return [
        () => {
          return (tree: Root, file) => {
            const curSlug = simplifySlug(file.data.slug!)
            const outgoing: Set<SimpleSlug> = new Set()

            const transformOptions: TransformOptions = {
              strategy: opts.markdownLinkResolution,
              allSlugs: ctx.allSlugs,
            }

            visitParents(tree, "element", (node, ancestors) => {
              const isMusicianNode = ancestors.some((ancestor) => {
                return (
                 ancestor.type === 'element' &&
                 ancestor.properties?.dataCallout?.includes('members')
                );
              });
              const isPastMusicianNode = ancestors.some((ancestor) => {
                return (
                 ancestor.type === 'element' &&
                 ancestor.properties?.dataCallout?.includes('pastmembers')
                );
              });
              const isTouringMusicianNode = ancestors.some((ancestor) => {
                return (
                 ancestor.type === 'element' &&
                 ancestor.properties?.dataCallout?.includes('touringmembers')
                );
              });
              const isBandNode = ancestors.some((ancestor) => {
                return (
                 ancestor.type === 'element' &&
                 ancestor.properties?.dataCallout?.includes('bands')
                );
              });

              if (isMusicianNode || isBandNode || isPastMusicianNode || isTouringMusicianNode) {
                if (node.tagName === 'a') {
                  let dest = node.properties.href as RelativeURL
                  const isInternal = !(
                    isAbsoluteUrl(dest, { httpOnly: false }) || dest.startsWith("#")
                  )
                  if (isInternal) {
                    dest = node.properties.href = transformLink(
                      file.data.slug!,
                      dest,
                      transformOptions,
                    )

                    const url = new URL(dest, "https://base.com/" + stripSlashes(curSlug, true))
                    const canonicalDest = url.pathname
                    let [destCanonical, _destAnchor] = splitAnchor(canonicalDest)
                    if (destCanonical.endsWith("/")) {
                      destCanonical += "index"
                    }
                    const full = decodeURIComponent(stripSlashes(destCanonical, true)) as FullSlug
                    const simple = simplifySlug(full)

                    if (simple.toString().startsWith("tags/")) {
                      return
                    }
                    outgoing.add(simple)
                  }
                }
              }
            })

            file.data.disctrictGraphLinks = [...outgoing]
          }
        },
      ]
    },
  }
}

declare module "vfile" {
  interface DataMap {
    links: SimpleSlug[]
  }
}
