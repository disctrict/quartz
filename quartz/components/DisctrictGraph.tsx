import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
// @ts-ignore
import script from "./scripts/disctrictgraph.inline"
import style from "./styles/disctrictgraph.scss"
import { i18n } from "../i18n"
import { classNames } from "../util/lang"

export interface D3Config {
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
  initialScale?: number
}

interface GraphOptions {
  disctrictGraph: Partial<D3Config> | undefined
}

const defaultOptions: GraphOptions = {
  disctrictGraph: {
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
        <div class="disctrict-graph-controls">
          <div class="disctrict-global-graph-controls">
            <button type="button" class="disctrict-graph-btn" >G</button>
            <button type="button" class="disctrict-travel-btn">T</button>
          </div>
          <div class="disctrict-travel-graph-controls disctrict-hidden">
            <select id="travel-origin"><option data-placeholder="true"></option></select>
            <select id="travel-target"><option data-placeholder="true"></option></select>
            <button type="button" class="disctrict-travel-query-btn">Calculate Journey</button>
          </div>
        </div>
        <div class="disctrict-graph-outer">
          <div class="disctrict-graph-container"  data-cfg={JSON.stringify(disctrictGraph)}></div>
          <div class="disctrict-travel-container disctrict-hidden" data-cfg={JSON.stringify(disctrictGraph)}></div>
        </div>
      </div>
    )
  }

  DisctrictGraph.css = style
  DisctrictGraph.afterDOMLoaded = script

  return DisctrictGraph
}) satisfies QuartzComponentConstructor
