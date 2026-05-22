import type { DisctrictGraphDetails } from "../../../plugins/emitters/disctrictGraphData"
import {
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
import { Text, Graphics, Application, Container, Circle, TextStyle } from "pixi.js"
import { Group as TweenGroup, Tween as Tweened } from "@tweenjs/tween.js"
import { removeAllChildren } from "../util"
import { FullSlug, SimpleSlug, resolveRelative, simplifySlug } from "../../../util/path"
import { D3Config } from "../../Disctrict"
import SlimSelect from 'slim-select'
import Graph from 'graphology'
import {bidirectional} from 'graphology-shortest-path'
import { 
  SimpleLinkData, 
  NodeData, 
  TweenNode, 
  LinkRenderData, 
  NodeRenderData, 
  LinkData, 
  computedStyleMap,
 } from "./disctrict_utils"


let disctrictContainerCleanups: (() => void)[] = []
let journeyOriginSlimSelect:SlimSelect
let journeyTargetSlimSelect:SlimSelect
const journeyGraph = new Graph()

export async function renderUtility(_slug:FullSlug) {
  cleanupUtilityContainers()
}

export function cleanupUtilityContainers() {
  for (const cleanup of disctrictContainerCleanups) {
    cleanup()
  }
  disctrictContainerCleanups = []
}

export async function prepareUtilityContainer() {
  const outerContainer:HTMLDivElement | null = document.querySelector(".disctrict-graph-outer")
  const journeyContainer:HTMLDivElement = document.createElement('div')
  const globalControlContainer:HTMLDivElement | null = document.querySelector(".disctrict-global-graph-controls")
  const journeyControlContainer:HTMLDivElement = document.createElement('div')
  const icon   = document.createElement('div')
  const button = document.createElement('button')
  const queryButton = document.createElement('button')
  const targetSelect = document.createElement('select')
  const originSelect = document.createElement('select')
  const data: Map<SimpleSlug, DisctrictGraphDetails> = new Map(
    Object.entries<DisctrictGraphDetails>(await fetchDisctrictGraphData).map(([k, v]) => [
      simplifySlug(k as FullSlug),
      v,
    ]),
  )
  const links: SimpleLinkData[] = []
  const validLinks = new Set(data.keys())

  journeyContainer.classList.add("disctrict-journey-container")
  journeyContainer.classList.add("disctrict-hidden")

  journeyControlContainer.classList.add("disctrict-journey-graph-controls")
  journeyControlContainer.classList.add("disctrict-hidden")

  icon.classList.add("icon")

  button.classList.add("disctrict-journey-btn")
  button.title = "Journey Calculator"
  button.appendChild(icon)
  button?.addEventListener("click", async () => {
    const divs = document.querySelectorAll(".disctrict-graph-outer > div")
    divs.forEach((item) => {
      item.classList.add("disctrict-hidden")
      const container = document.querySelector(".disctrict-journey-container")
      const controls  = document.querySelector(".disctrict-journey-graph-controls")
      container?.classList.remove("disctrict-hidden")
      controls?.classList.remove("disctrict-hidden")
    })
  })

  queryButton.title = "Calculate Journey"
  queryButton.textContent = "Calculate Journey"

  queryButton?.addEventListener("click", () => {
      populateGraphJourney()
  })

  journeyControlContainer.appendChild( originSelect )
  journeyControlContainer.appendChild( targetSelect )
  journeyControlContainer.appendChild( queryButton  )

  outerContainer?.appendChild(journeyControlContainer)
  outerContainer?.appendChild(journeyContainer)

  globalControlContainer?.appendChild( button )
  
  journeyOriginSlimSelect = new SlimSelect( {select: originSelect } )
  journeyTargetSlimSelect = new SlimSelect( {select: targetSelect } )

  for (const [source, details] of data.entries()) {
    const outgoing = details.links ?? []
    journeyOriginSlimSelect.addOption({text:details.title, value:details.slug})
    journeyTargetSlimSelect.addOption({text:details.title, value:details.slug})
    
    for (const dest of outgoing) {
      if (validLinks.has(dest)) {
        links.push({ source: source, target: dest })
        journeyGraph.mergeNode(source)
        journeyGraph.mergeNode(dest)
        journeyGraph.mergeEdge(source, dest)
        journeyGraph.mergeEdge(dest, source)
      }
    }
  }
}

async function populateGraphJourney() {
  const disctrictGraphContainers = document.getElementsByClassName("disctrict-journey-container")
  for (const container of disctrictGraphContainers) {
      disctrictContainerCleanups.push(await graphJourney(container as HTMLElement))
  }
}

async function graphJourney(container:HTMLElement):Promise<(() => void)> {
  removeAllChildren(container)
  let error:boolean = false
  const origin = journeyOriginSlimSelect.getSelected()
  const target = journeyTargetSlimSelect.getSelected()
  const outer:HTMLElement | null = document.querySelector(".disctrict-graph-outer")

  if ( !journeyGraph.hasNode(origin) ) {
    const errorElement: HTMLParagraphElement = document.createElement("p")
    errorElement.textContent = "Invalid source node"
    container.appendChild(errorElement)
    error = true
  }  

  if (!journeyGraph.hasNode(target) ) {
    const errorElement: HTMLParagraphElement = document.createElement("p")
    errorElement.textContent = "Invalid destination node"
    container.appendChild(errorElement)
    error = true
  }

  if (error) {
    return () => {
      stopAnimation = true
      app.destroy()
    }
  }
  const slug: string = window.location.pathname
  const shortest = bidirectional(
    journeyGraph,
    origin,
    target,
  )

  if (shortest == null) {
    const errorElement:HTMLParagraphElement = document.createElement("p")
    errorElement.textContent = "No path discovered"
    container.appendChild(errorElement)
    return () => {
      stopAnimation = true
      app.destroy()
    }
  }

  let {
    scale,
    repelForce,
    centerForce,
    linkDistance,
    fontSize,
    focusOnHover,
  } = JSON.parse(outer?.dataset["cfg"]!) as D3Config

  let simpleLinks:SimpleLinkData[] = []
  let journeyNodes:NodeData[] = []
  let neighbourhood = new Set<SimpleSlug>()

  shortest?.forEach( (value, index, array) => {
    if (index + 1 < array.length ) {
      const srcNode:NodeData = {
        id: simplifySlug(value as FullSlug),
        text:value.split("/")[1].replaceAll("-", " "),
        tags: []
      }

      simpleLinks.push( {source: simplifySlug(value as FullSlug), target: simplifySlug(array[index+1] as FullSlug)})

      if ( !journeyNodes.includes(srcNode)){
        journeyNodes.push(srcNode)
        neighbourhood.add(simplifySlug(value as FullSlug))
      }
    } else {
      const srcNode:NodeData = {
        id: simplifySlug(value as FullSlug),
        text:value.split("/")[1].replaceAll("-", " "),
        tags: []
      }
      neighbourhood.add(simplifySlug(value as FullSlug))
      journeyNodes.push(srcNode)
    }
  })

  const tweens = new Map<string, TweenNode>()

  const graphData: { nodes: NodeData[]; links: LinkData[] } = {
    nodes: journeyNodes,
    links: simpleLinks
    .filter((l) => neighbourhood.has(l.source) && neighbourhood.has(l.target))
      .map((l) => ({
        source: journeyNodes.find((n) => n.id === l.source)!,
        target: journeyNodes.find((n) => n.id === l.target)!,
      })),
  }

  const width = container.offsetWidth
  const height = Math.max(container.offsetHeight, 400)

  // we virtualize the simulation and use pixi to actually render it
  const simulation: Simulation<NodeData, LinkData> = forceSimulation<NodeData>(graphData.nodes)
    .force("charge",  forceManyBody().strength(-100 * repelForce))
    .force("center",  forceCenter().strength(centerForce))
    .force("link",    forceLink(graphData.links).distance(linkDistance))
    .force("collide", forceCollide<NodeData>((n) => nodeRadius(n)).iterations(3))

  const radius = (Math.min(width, height) / 2) * 0.8
  simulation.force("radial", forceRadial(radius).strength(0.2))

  const color = (d: NodeData) => {
    if ( d.id.toLowerCase().startsWith("bands/") ) {
      return computedStyleMap["--band-idle"]
    }

    if ( d.id.toLowerCase().startsWith("musicians/") ) {
      return computedStyleMap["--musician-idle"]
    }

    return computedStyleMap["--gray"]
  }

  function nodeRadius(d: NodeData) {
    const numLinks = graphData.links.filter(
      (l) => l.source.id === d.id || l.target.id === d.id,
    ).length
    return 2 + Math.sqrt(numLinks)
  }

  let hoveredNodeId: string | null = null
  let hoveredNeighbours: Set<string> = new Set()
  const linkRenderData: LinkRenderData[] = []
  const nodeRenderData: NodeRenderData[] = []

  function updateHoverInfo(newHoveredId: string | null) {
    hoveredNodeId = newHoveredId

    if (newHoveredId === null) {
      hoveredNeighbours = new Set()
      for (const n of nodeRenderData) {
        n.active = false
      }

      for (const l of linkRenderData) {
        l.active = false
      }
    } else {
      hoveredNeighbours = new Set()
      for (const l of linkRenderData) {
        const linkData = l.simulationData
        if (linkData.source.id === newHoveredId || linkData.target.id === newHoveredId) {
          hoveredNeighbours.add(linkData.source.id)
          hoveredNeighbours.add(linkData.target.id)
        }

        l.active = linkData.source.id === newHoveredId || linkData.target.id === newHoveredId
      }

      for (const n of nodeRenderData) {
        n.active = hoveredNeighbours.has(n.simulationData.id)
      }
    }
  }

  let dragStartTime = 0
  let dragging = false

  function renderLinks() {
    tweens.get("link")?.stop()
    const tweenGroup = new TweenGroup()

    for (const l of linkRenderData) {
      let alpha = 1

      if (hoveredNodeId) {
        alpha = l.active ? 1 : 0.2
      }

      l.color = l.active ? computedStyleMap["--gray"] : computedStyleMap["--lightgray"]
      tweenGroup.add(new Tweened<LinkRenderData>(l).to({ alpha }, 200))
    }

    tweenGroup.getAll().forEach((tw) => tw.start())
    tweens.set("link", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop())
      },
    })
  }

  function renderLabels() {
    tweens.get("label")?.stop()
    const tweenGroup = new TweenGroup()

    const defaultScale = 1 / scale
    const activeScale = defaultScale * 1.1
    for (const n of nodeRenderData) {
      const nodeId = n.simulationData.id

      if (hoveredNodeId === nodeId) {
        tweenGroup.add(
          new Tweened<Text>(n.label).to(
            {
              alpha: 1,
              scale: { x: activeScale, y: activeScale },
            },
            100,
          ),
        )
      } else {
        tweenGroup.add(
          new Tweened<Text>(n.label).to(
            {
              alpha: n.label.alpha,
              scale: { x: defaultScale, y: defaultScale },
            },
            100,
          ),
        )
      }
    }

    tweenGroup.getAll().forEach((tw) => tw.start())
    tweens.set("label", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop())
      },
    })
  }

  function renderNodes() {
    tweens.get("hover")?.stop()

    const tweenGroup = new TweenGroup()
    for (const n of nodeRenderData) {
      let alpha = 1

      // if we are hovering over a node, we want to highlight the immediate neighbours
      if (hoveredNodeId !== null && focusOnHover) {
        alpha = n.active ? 1 : 0.2
      }

      tweenGroup.add(new Tweened<Graphics>(n.gfx, tweenGroup).to({ alpha }, 200))
    }

    tweenGroup.getAll().forEach((tw) => tw.start())
    tweens.set("hover", {
      update: tweenGroup.update.bind(tweenGroup),
      stop() {
        tweenGroup.getAll().forEach((tw) => tw.stop())
      },
    })
  }

  function renderPixiFromD3() {
    renderNodes()
    renderLinks()
    renderLabels()
  }

  tweens.forEach((tween) => tween.stop())
  tweens.clear()

  const app = new Application()
  await app.init({
    width,
    height,
    antialias: true,
    autoStart: false,
    autoDensity: true,
    backgroundAlpha: 0,
    preference: "webgpu",
    resolution: window.devicePixelRatio,
    eventMode: "static",
  })
  container.appendChild(app.canvas)

  const journeyStage = app.stage
  journeyStage.interactive = false

  const hopReportContainer     = new Container<Text>({ zIndex: 3, isRenderGroup: true })
  const journeyLabelsContainer = new Container<Text>({ zIndex: 3, isRenderGroup: true })
  const journeyNodesContainer  = new Container<Graphics>({ zIndex: 2, isRenderGroup: true })
  const journeyLinkContainer   = new Container<Graphics>({ zIndex: 1, isRenderGroup: true })
  journeyStage.addChild(journeyNodesContainer, journeyLabelsContainer, journeyLinkContainer)

  const style = new TextStyle({
    fontFamily: 'Arial',
    fontSize: 12,
    fill: '#ffffff', // Hex color
    stroke: '#000000',
    dropShadow: true,
  });

  const hopText = shortest?.length === 1 ? "hop" : "hops"
  const hopReport = new Text({
      text: shortest?.length + " " + hopText + " from " + String(origin).split("/")[1].replace("-", " ") + " to " + String(target).split("/")[1].replace("-", " "),
      style: style
  });

  // 4. Position and add to stage
  hopReport.x = 5;
  hopReport.y = 5;
  
  hopReportContainer.addChild(hopReport)

  journeyStage.addChild(hopReportContainer)

  for (const n of graphData.nodes) {
    const nodeId = n.id

    let textColor = computedStyleMap["--dark"]

    if (nodeId.toLowerCase().startsWith("musicians/")) {
        textColor = computedStyleMap["--musician-label"]
    }

    const label = new Text({
      interactive: false,
      eventMode: "none",
      text: n.text,
      alpha: 1,
      anchor: { x: 0.5, y: 1.2 },
      style: {
        fontSize: fontSize * 15,
        fill: textColor, 
        fontFamily: computedStyleMap["--bodyFont"],
      },
      resolution: window.devicePixelRatio * 4,
      slug: nodeId,
    })
    label.scale.set(1 / scale)

    let oldLabelOpacity = 0
    let gfx 

    gfx = new Graphics({
      interactive: true,
      label: nodeId,
      eventMode: "static",
      hitArea: new Circle(0, 0, nodeRadius(n)),
      cursor: "pointer",
    })
      .circle(0, 0, nodeRadius(n))
      .fill({ color: color(n) })
      .on("pointerover", (e) => {
        updateHoverInfo(e.target.label)
        oldLabelOpacity = label.alpha
        if (!dragging) {
          renderPixiFromD3()
        }
      })
      .on("pointerleave", () => {
        updateHoverInfo(null)
        label.alpha = oldLabelOpacity
        if (!dragging) {
          renderPixiFromD3()
        }
      })

    journeyNodesContainer.addChild(gfx)
    journeyLabelsContainer.addChild(label)

    const nodeRenderDatum: NodeRenderData = {
      simulationData: n,
      gfx,
      label,
      color: color(n),
      alpha: 1,
      active: false,
    }

    nodeRenderData.push(nodeRenderDatum)
  }

  for (const l of graphData.links) {
    const gfx = new Graphics({ interactive: false, eventMode: "none" })
    journeyLinkContainer.addChild(gfx)

    const linkRenderDatum: LinkRenderData = {
      simulationData: l,
      gfx,
      color: computedStyleMap["--lightgray"],
      alpha: 1,
      active: false,
    }

    linkRenderData.push(linkRenderDatum)
  }

  let currentTransform = zoomIdentity
  select<HTMLCanvasElement, NodeData | undefined>(app.canvas).call(
    drag<HTMLCanvasElement, NodeData | undefined>()
      .container(() => app.canvas)
      .subject(() => graphData.nodes.find((n) => n.id === hoveredNodeId))
      .on("start", function dragstarted(event) {
        if (!event.active) simulation.alphaTarget(1).restart()
        event.subject.fx = event.subject.x
        event.subject.fy = event.subject.y
        event.subject.__initialDragPos = {
          x: event.subject.x,
          y: event.subject.y,
          fx: event.subject.fx,
          fy: event.subject.fy,
        }
        dragStartTime = Date.now()
        dragging = true
      })
      .on("drag", function dragged(event) {
        const initPos = event.subject.__initialDragPos
        event.subject.fx = initPos.x + (event.x - initPos.x) / currentTransform.k
        event.subject.fy = initPos.y + (event.y - initPos.y) / currentTransform.k
      })
      .on("end", function dragended(event) {
        if (!event.active) simulation.alphaTarget(0)
        event.subject.fx = null
        event.subject.fy = null
        dragging = false

        // if the time between mousedown and mouseup is short, we consider it a click
        if (Date.now() - dragStartTime < 500) {
          const node = graphData.nodes.find((n) => n.id === event.subject.id) as NodeData
          const targ = resolveRelative("/" + node.id as FullSlug, node.id)
          if (slug !== node.id) {
            window.spaNavigate(new URL(targ, window.location.toString()))
          }
        }
      }),
  )
  
  select<HTMLCanvasElement, NodeData>(app.canvas).call(
    zoom<HTMLCanvasElement, NodeData>()
      .extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([0.25, 4])
      .on("zoom", ({ transform }) => {
        currentTransform = transform
        journeyStage.scale.set(transform.k, transform.k)
        journeyStage.position.set(transform.x, transform.y)

        for (const label of journeyLabelsContainer.children) {
            label.alpha = 1
        }
      }),
  )

  let stopAnimation = false
  function animate(time: number) {
    if (stopAnimation) return
    for (const n of nodeRenderData) {
      const { x, y } = n.simulationData
      if (!x || !y) continue
      n.gfx.position.set(x + width / 2, y + height / 2)
      if (n.label) {
        n.label.position.set(x + width / 2, y + height / 2)
      }
    }

    for (const l of linkRenderData) {
      const linkData = l.simulationData

      l.gfx.clear()
      l.gfx.moveTo(linkData.source.x! + width / 2, linkData.source.y! + height / 2)
      l.gfx
        .lineTo(linkData.target.x! + width / 2, linkData.target.y! + height / 2)
        .stroke({ alpha: 1, width: 1, color: l.color })
    }

    tweens.forEach((t) => t.update(time))
    app.renderer.render(journeyStage)
    requestAnimationFrame(animate)
  }


  requestAnimationFrame(animate)
  

  return () => {
    stopAnimation = true
    app.destroy()
  }
}




