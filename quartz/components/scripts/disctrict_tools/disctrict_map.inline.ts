import type { DisctrictGraphDetails } from "../../../plugins/emitters/disctrictGraphData"
import {
  ExtendedFeatureCollection,
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
  selectAll,
  json
} from "d3"
import { Text, Graphics, GraphicsContext, Application, Container, Circle, Assets } from "pixi.js"
import { Group as TweenGroup, Tween as Tweened } from "@tweenjs/tween.js"
import { removeAllChildren } from "../util"
import { FullSlug, SimpleSlug, resolveRelative, simplifySlug } from "../../../util/path"
import { D3Config } from "../../Disctrict"
import { 
  SimpleLinkData, 
  NodeData, 
  TweenNode, 
  LinkRenderData, 
  NodeRenderData, 
  LinkData, 
  computedStyleMap,
  getVisited,
 } from "./disctrict_utils"
import { geoPath, GeoPath, GeoProjection, geoEqualEarth } from 'd3-geo'


let disctrictContainerCleanups: (() => void)[] = []

export async function renderUtility(slug:FullSlug) {
  cleanupUtilityContainers()
  const disctrictGraphContainers = document.getElementsByClassName("disctrict-map-container")
  for (const container of disctrictGraphContainers) {
      disctrictContainerCleanups.push(await renderGraph(container as HTMLElement, slug))
  }
}

export function cleanupUtilityContainers() {
  for (const cleanup of disctrictContainerCleanups) {
    cleanup()
  }
  disctrictContainerCleanups = []
}

export function prepareUtilityContainer() {
  const outerContainer:HTMLDivElement | null = document.querySelector(".disctrict-graph-outer")
  const controlContainer:HTMLDivElement | null = document.querySelector(".disctrict-global-graph-controls")
  const mapContainer:HTMLDivElement = document.createElement('div')
  const icon = document.createElement('div')
  const button = document.createElement('button')
  const svg = document.createElement('svg')

  mapContainer.classList.add("disctrict-map-container")
  svg.classList.add("disctrict-map-svg")

  icon.classList.add("icon")
  button.classList.add("disctrict-map-btn")
  button.title = "Graph View"
  button.appendChild(icon)

  button?.addEventListener("click", async () => {
    const divs = document.querySelectorAll(".disctrict-graph-outer > div")
    divs.forEach((item) => {
      item.classList.add("disctrict-hidden")
      const container = document.querySelector(".disctrict-map-container")
      container?.classList.remove("disctrict-hidden")
    })
  })

  outerContainer?.appendChild( mapContainer )
  mapContainer?.appendChild(svg)
  controlContainer?.appendChild( button )
}

async function renderGraph(graph: HTMLElement, fullSlug: FullSlug) {
  const slug = simplifySlug(fullSlug)
  const visited = getVisited()
  const outer:HTMLElement | null = document.querySelector(".disctrict-graph-outer")

  removeAllChildren(graph)

  let {
    depth,
    scale,
    repelForce,
    centerForce,
    linkDistance,
    fontSize,
    opacityScale,
    showTags,
    focusOnHover,
  } = JSON.parse(outer?.dataset["cfg"]!) as D3Config

  if ( slug === "/" ) {
    depth = -1
  }

  const data: Map<SimpleSlug, DisctrictGraphDetails> = new Map(
    Object.entries<DisctrictGraphDetails>(await fetchDisctrictGraphData).map(([k, v]) => [
      simplifySlug(k as FullSlug),
      v,
    ]),
  )
  const links: SimpleLinkData[] = []
  const tags: SimpleSlug[] = []
  const validLinks = new Set(data.keys())
  const tweens = new Map<string, TweenNode>()

  for (const [source, details] of data.entries()) {
    const outgoing = details.links ?? []

    for (const dest of outgoing) {
      if (validLinks.has(dest)) {
        links.push({ source: source, target: dest })
      }
    }
  }

  const neighbourhood = new Set<SimpleSlug>()
  const wl: (SimpleSlug | "__SENTINEL")[] = [slug, "__SENTINEL"]
  if (depth >= 0) {
    while (depth >= 0 && wl.length > 0) {
      // compute neighbours
      const cur = wl.shift()!
      if (cur === "__SENTINEL") {
        depth--
        wl.push("__SENTINEL")
      } else {
        neighbourhood.add(cur)
        const outgoing = links.filter((l) => l.source === cur)
        const incoming = links.filter((l) => l.target === cur)
        wl.push(...outgoing.map((l) => l.target), ...incoming.map((l) => l.source))
      }
    }
  } else {
    validLinks.forEach((id) => neighbourhood.add(id))
    if (showTags) tags.forEach((tag) => neighbourhood.add(tag))
  }

  const nodes = [...neighbourhood].map((url) => {
    const text = url.startsWith("tags/") ? "#" + url.substring(5) : (data.get(url)?.title ?? url)
    return {
      id: url,
      text,
      tags: data.get(url)?.tags ?? [],
    }
  })
  const graphData: { nodes: NodeData[]; links: LinkData[] } = {
    nodes,
    links: links
      .filter((l) => neighbourhood.has(l.source) && neighbourhood.has(l.target))
      .map((l) => ({
        source: nodes.find((n) => n.id === l.source)!,
        target: nodes.find((n) => n.id === l.target)!,
      })),
  }

  const width = graph.offsetWidth
  const height = Math.max(graph.offsetHeight, 400)

  // we virtualize the simulation and use pixi to actually render it
  const simulation: Simulation<NodeData, LinkData> = forceSimulation<NodeData>(graphData.nodes)
    .force("charge", forceManyBody().strength(-100 * repelForce))
    .force("center", forceCenter().strength(centerForce))
    .force("link", forceLink(graphData.links).distance(linkDistance))
    .force("collide", forceCollide<NodeData>((n) => nodeRadius(n)).iterations(3))

  const radius = (Math.min(width, height) / 2) * 0.8
  simulation.force("radial", forceRadial(radius).strength(0.2))

  const color = (d: NodeData) => {
    const isCurrent = d.id === slug

    if ( d.id.toLowerCase().startsWith("bands/") ) {
        if (isCurrent) {
          return computedStyleMap["--root-band"]
        } else {
          return computedStyleMap["--band-idle"]
       }
    }

    if ( d.id.toLowerCase().startsWith("musicians/") ) {
        if (isCurrent) {
          return computedStyleMap["--root-musician"]
        } else {
          return computedStyleMap["--musician-idle"]
       }
    }

    if (isCurrent) {
      return computedStyleMap["--secondary"]
    } else if (visited.has(d.id) || d.id.startsWith("tags/")) {
      return computedStyleMap["--tertiary"]
    } else {
      return computedStyleMap["--gray"]
    }
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

    const projection: GeoProjection = geoEqualEarth()
      .scale(150)
      .translate([width / 2, height / 2]);

  
  const mapContainer = new Container<Graphics>({ zIndex: 2, isRenderGroup: true })
  const pathGenerator: GeoPath = geoPath().projection(projection);
  const svg = document.createElement("svg")
  const svgSelection = select(svg)
 //   .append("svg")
    .attr("width", width)
    .attr("height", height);

  async function drawMap() {
      try {
          const geoData: ExtendedFeatureCollection = await json(
              "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/refs/heads/master/geojson/ne_50m_land.geojson"
          ) as ExtendedFeatureCollection;

          svgSelection.selectAll("path")
              .data(geoData.features)
              .enter()
              .append("path")
              .attr("d", (d: any) => pathGenerator(d)) // Generate the 'd' attribute string
              .attr("fill", "#1b1b1b")
              .attr("stroke", "#fff")
              .attr("stroke-width", 0.5);
              
      } catch (error) {
          console.error("Error loading GeoJSON:", error);
      }
  }

  await drawMap();

  const svgContext = new GraphicsContext().svg(svg)
  const mapGraphics = new Graphics(svgContext)

  mapContainer.addChild(mapGraphics)


  const app = new Application()
  await app.init({
    width: screen.width,
    height:screen.height,
    antialias: true,
    autoStart: false,
    autoDensity: true,
    backgroundAlpha: 0,
    preference: "webgpu",
    resolution: window.devicePixelRatio,
    eventMode: "static",
  })
  graph.appendChild(app.canvas)

  const stage = app.stage
  stage.interactive = false

  const labelsContainer = new Container<Text>({ zIndex: 3, isRenderGroup: true })
  const nodesContainer = new Container<Graphics>({ zIndex: 2, isRenderGroup: true })
  const linkContainer = new Container<Graphics>({ zIndex: 1, isRenderGroup: true })
  stage.addChild(mapContainer, nodesContainer, labelsContainer, linkContainer)

  for (const n of graphData.nodes) {
    const nodeId = n.id
    const targetAlpha = nodeId == slug ? 1 : 0;

    let textColor = computedStyleMap["--dark"]

    if (nodeId.toLowerCase().startsWith("musicians/")) {
        textColor = computedStyleMap["--musician-label"]
    }

    const label = new Text({
      interactive: false,
      eventMode: "none",
      text: n.text,
      alpha: targetAlpha,
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
    const isTagNode = nodeId.startsWith("tags/")

    if (slug !== nodeId) {
      gfx = new Graphics({
        interactive: true,
        label: nodeId,
        eventMode: "static",
        hitArea: new Circle(0, 0, nodeRadius(n)),
        cursor: "pointer",
      })
        .circle(0, 0, nodeRadius(n))
        .fill({ color: isTagNode ? computedStyleMap["--light"] : color(n) })
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
    } else {
      const svgContext = await Assets.load({
        src: '/static/disctrict.svg', 
        data: {
          parseAsGraphicsContext: true,
        } 
      }).catch( () => {
        const svgString = `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="50" fill="green"/></svg>`        
        return new GraphicsContext().svg(svgString)
      })

      gfx = new Graphics(svgContext)
        .fill({ color: isTagNode ? computedStyleMap["--light"] : color(n) })
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

      const bounds = gfx.getLocalBounds();
      gfx.pivot.set((bounds.x + bounds.width) / 2 + 5, (bounds.y + bounds.height));
      gfx.scale.set(.1)
    }

    if (isTagNode) {
      gfx.stroke({ width: 2, color: computedStyleMap["--tertiary"] })
    }

    nodesContainer.addChild(gfx)
    labelsContainer.addChild(label)

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
    linkContainer.addChild(gfx)

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
          const targ = resolveRelative(fullSlug, node.id)
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
        stage.scale.set(transform.k, transform.k)
        stage.position.set(transform.x, transform.y)

        // zoom adjusts opacity of labels too
        const scale = transform.k * opacityScale
        let scaleOpacity = Math.max((scale - 1) / 3.75, 0)
        const activeNodes = nodeRenderData.filter((n) => n.active).flatMap((n) => n.label)

        for (const label of labelsContainer.children) {
          if (!activeNodes.includes(label)) {
            label.alpha =  (label.slug == slug) ? 1 : scaleOpacity 
          }
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
        if (slug === n.simulationData.id) {
          n.label.position.set(x + width / 2, y + height / 2 + 12)
        } else {
          n.label.position.set(x + width / 2, y + height / 2)
        }
      }
    }

    for (const l of linkRenderData) {
      const linkData = l.simulationData
      l.gfx.clear()
      l.gfx.moveTo(linkData.source.x! + width / 2, linkData.source.y! + height / 2)
      l.gfx
        .lineTo(linkData.target.x! + width / 2, linkData.target.y! + height / 2)
        .stroke({ alpha: l.alpha, width: 1, color: l.color })
    }

    tweens.forEach((t) => t.update(time))
    app.renderer.render(stage)
    requestAnimationFrame(animate)
  }

  requestAnimationFrame(animate)
  return () => {
    stopAnimation = true
    app.destroy()
  }
}