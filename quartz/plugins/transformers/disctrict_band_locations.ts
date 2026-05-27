import matter from "gray-matter"
import remarkFrontmatter from "remark-frontmatter"
import { QuartzTransformerPlugin } from "../types"
import yaml from "js-yaml"
import toml from "toml"
import { i18n } from "../../i18n"

export interface DisctrictBandLocationData {
  title: string[]
  location: string[]
}

export interface Options {
  delimiters: string | [string, string]
  language: "yaml" | "toml"
}

const defaultOptions: Options = {
  delimiters: "---",
  language: "yaml",
}

export const DisctrictBandLocations: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  return {
    name: "DisctrictBandLocations",
    markdownPlugins(ctx) {
      const { cfg } = ctx
      return [
        [remarkFrontmatter, ["yaml", "toml"]],
        () => {
          return (_, file) => {
            const fileData = Buffer.from(file.value as Uint8Array)
            const { data } = matter(fileData, {
              ...opts,
              engines: {
                yaml: (s) => yaml.load(s, { schema: yaml.JSON_SCHEMA }) as object,
                toml: (s) => toml.parse(s) as object,
              },
            })

            if (data.title != null && data.title.toString() !== "") {
              data.title = data.title.toString()
            } else {
              data.title = file.stem ?? i18n(cfg.configuration.locale).propertyDefaults.title
            }

            if (data.location != null && data.location.toString() !== "") {
              data.location = data.location.toString()
            }

            file.data.disctrictBandLocations = data
          }
        },
      ]
    },
  }
}

declare module "vfile" {
  interface DataMap extends DisctrictBandLocationData {}
}
