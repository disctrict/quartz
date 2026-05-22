import {
  SimulationNodeDatum,
  SimulationLinkDatum,
  Simulation,
  forceSimulation,
  forceManyBody,
  forceCenter,
  forceLink,
  forceCollide,
  forceRadial,
  zoomIdentity,
  select,
  drag,
  zoom,
} from "d3"
import { Text, Graphics, Application, Container, Circle, Assets, TextStyle } from "pixi.js"
import { FullSlug, SimpleSlug, resolveRelative, simplifySlug } from "../../../util/path"

export type DisctrictButtonSetup = {
    button: Element | null
    container: NodeListOf<Element>
}

export type GraphicsInfo = {
    color: string
    gfx: Graphics
    alpha: number
    active: boolean
}

export type NodeData = {
    id: SimpleSlug
    text: string
    tags: string[]
} & SimulationNodeDatum

export type SimpleLinkData = {
    source: SimpleSlug
    target: SimpleSlug
}

export type LinkData = {
    source: NodeData
    target: NodeData
} & SimulationLinkDatum<NodeData>

export type LinkRenderData = GraphicsInfo & {
    simulationData: LinkData
}

export type NodeRenderData = GraphicsInfo & {
    simulationData: NodeData
    label: Text
}

export type TweenNode = {
    update: (time: number) => void
    stop: () => void
}

const cssVars = [
    "--secondary",
    "--tertiary",
    "--gray",
    "--light",
    "--lightgray",
    "--dark",
    "--darkgray",
    "--bodyFont",
    "--root-band",
    "--band-idle",
    "--band-active",
    "--root-musician",
    "--musician-idle",
    "--musician-active",
    "--musician-label",
] as const

export const computedStyleMap = cssVars.reduce(
        (acc, key) => {
            acc[key] = getComputedStyle(document.documentElement).getPropertyValue(key)
            return acc
        },
        {} as Record<(typeof cssVars)[number], string>,
    )

const disctrictStorageKey = "disctrict-graph-visited"

export function getVisited(): Set<SimpleSlug> {
    return new Set(JSON.parse(localStorage.getItem(disctrictStorageKey) ?? "[]"))
}

export function addToVisited(slug: SimpleSlug) {
    const visited = getVisited()
    visited.add(slug)
    localStorage.setItem(disctrictStorageKey, JSON.stringify([...visited]))
}
