import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
// @ts-ignore
import script from "./scripts/disctrict_tools_wrapper.inline"
import style from "./styles/disctrict.scss"
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

interface DisctrictGraphOptions {
  disctrictGraph: Partial<D3Config> | undefined
}

const defaultOptions: DisctrictGraphOptions = {
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

export default ((opts?: Partial<DisctrictGraphOptions>) => {
  const DisctrictGraph: QuartzComponent = ({ displayClass, cfg }: QuartzComponentProps) => {
    const disctrictGraph = { ...defaultOptions.disctrictGraph, ...opts?.disctrictGraph }
    return (
      <div class={classNames(displayClass, "disctrict", "popover-exclude")}>
        <div class="disctrict-popout-wrapper">
          <div class="disctrict-graph-controls">
            <div class="disctrict-global-graph-controls">
            </div>
          </div>
          <div class="disctrict-graph-outer" data-cfg={JSON.stringify(disctrictGraph)}></div>
        </div>
      </div>
    )
  }

  DisctrictGraph.css = style
  DisctrictGraph.afterDOMLoaded = script

  return DisctrictGraph
}) satisfies QuartzComponentConstructor
