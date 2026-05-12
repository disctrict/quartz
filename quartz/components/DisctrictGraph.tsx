import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
// @ts-ignore
import script from "./scripts/disctrictgraph.inline"
import style from "./styles/disctrictgraph.scss"
import { i18n } from "../i18n"
import { classNames } from "../util/lang"

export interface D3Config {
  drag: boolean
  zoom: boolean
  depth: number
  scale: number
  repelForce: number
  centerForce: number
  linkDistance: number
  fontSize: number
  opacityScale: number
  removeTags: string[]
  showTags: boolean
  focusOnHover?: boolean
  enableRadial?: boolean
  initialScale?: number
}

interface GraphOptions {
  disctrictGraph: Partial<D3Config> | undefined
}

const defaultOptions: GraphOptions = {
  disctrictGraph: {
    drag: true,
    zoom: true,
    depth: 2,
    scale: 1.1,
    repelForce: 0.5,
    centerForce: 1.0,
    linkDistance: 35,
    fontSize: 0.6,
    opacityScale: 1,
    showTags: true,
    removeTags: [],
    focusOnHover: false,
    initialScale: 5.0,
  },
}

export default ((opts?: Partial<GraphOptions>) => {
  const DisctrictGraph: QuartzComponent = ({ displayClass, cfg }: QuartzComponentProps) => {
    const disctrictGraph = { ...defaultOptions.disctrictGraph, ...opts?.disctrictGraph }
    return (
      <div class={classNames(displayClass, "disctrict-graph", "popover-exclude")}>
        <h3>{i18n(cfg.locale).components.disctrictGraph.title}</h3>
        <div class="disctrict-graph-outer">
          <div class="disctrict-graph-container" data-cfg={JSON.stringify(disctrictGraph)}></div>
        </div>
      </div>
    )
  }

  DisctrictGraph.css = style
  DisctrictGraph.afterDOMLoaded = script

  return DisctrictGraph
}) satisfies QuartzComponentConstructor
