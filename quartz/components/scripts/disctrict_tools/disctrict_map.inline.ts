import {
  ExtendedFeatureCollection,
  zoomIdentity,
  select,
  drag,
  zoom,
  json,
} from "d3"
import { Text, Graphics, GraphicsContext, Application, Container, Circle } from "pixi.js"
import { Group as TweenGroup, Tween as Tweened } from "@tweenjs/tween.js"
import { removeAllChildren } from "../util"
import { FullSlug, SimpleSlug, resolveRelative, simplifySlug } from "../../../util/path"
import { D3Config } from "../../Disctrict"
import { 
  NodeData, 
  TweenNode, 
  NodeRenderData, 
  computedStyleMap,
  getVisited,
 } from "./disctrict_utils"
import { geoPath, GeoPath, GeoProjection, geoEqualEarth } from 'd3-geo'

type LocationData = {
  title: string
  slug: SimpleSlug
  bands: []
}

type MapNodeData = {
  size: number
  latitude: number
  longitude: number
  title: string
  bands: BandData[]
} & NodeData

type BandData = {
  slug:SimpleSlug,
  title: string,
}

let disctrictContainerCleanups: (() => void)[] = []

export async function renderUtility(slug:FullSlug) {
  cleanupUtilityContainers()
  const disctrictGraphContainers = document.querySelectorAll(".disctrict-map-container > .disctrict-map-canvas")
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
  const mapCanvas:HTMLDivElement = document.createElement('div')
  const mapSidebar:HTMLDivElement = document.createElement('div')
  const sidebarTitle:HTMLHeadingElement = document.createElement('h2')
  const sidebarContent:HTMLDivElement = document.createElement('div')
  const mapContainer:HTMLDivElement = document.createElement('div')
  const icon = document.createElement('div')
  const button = document.createElement('button')
  const svg = document.createElement('svg')

  mapSidebar.classList.add("disctrict-map-sidebar")
  mapCanvas.classList.add("disctrict-map-canvas")
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
  mapContainer.appendChild(mapSidebar)
  mapSidebar.appendChild(sidebarTitle)
  mapSidebar.appendChild(sidebarContent)
  mapContainer.appendChild(mapCanvas)
  mapCanvas?.appendChild(svg)
  controlContainer?.appendChild( button )
}

async function renderGraph(graph: HTMLElement, fullSlug: FullSlug) {
  const slug = simplifySlug(fullSlug)
  const visited = getVisited()
  const outer:HTMLElement | null = document.querySelector(".disctrict-graph-outer")

  removeAllChildren(graph)

  let {
    scale,
    fontSize,
    opacityScale,
    focusOnHover,
  } = JSON.parse(outer?.dataset["cfg"]!) as D3Config

  const data: Map<string, LocationData> = new Map(
    Object.entries<LocationData>(await fetchDisctrictBandLocationData).map(([k, v]) => [
      k,
      v as LocationData,
    ]),
  )

  const tweens = new Map<string, TweenNode>()
  const nodes:Array<MapNodeData> = new Array<MapNodeData>

  data.forEach( (value, key) => {
    const [latitude, longitude] = key.split(",")
    nodes.push({
      id: value.slug,
      text:"",
      title: value.title,
      tags: [],
      longitude: Number(longitude),
      latitude: Number(latitude),
      size: value.bands.length,
      bands: value.bands,
    } as MapNodeData)
  })

  const mapData: { nodes: MapNodeData[] } = {
    nodes,
  }

  const width = graph.offsetWidth
  const height = Math.max(graph.offsetHeight, 400)

  const color = (d: MapNodeData) => {
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

  function nodeRadius(d: MapNodeData) {
    const numBands = d.size
    return Math.sqrt(numBands)
  }

  let hoveredNodeId: string | null = null

  const nodeRenderData: NodeRenderData[] = []

  function updateHoverInfo(newHoveredId: string | null) {
    hoveredNodeId = newHoveredId

    if (newHoveredId === null) {
      for (const n of nodeRenderData) {
        n.active = false
      }
    } else {
      for (const n of nodeRenderData) {
        if (newHoveredId === n.simulationData.id) {
          n.active = true
        }
      }
    }
  }
  
  let dragStartTime = 0
  let dragging = false

  function renderLabels() {
    tweens.get("label")?.stop()
    const tweenGroup = new TweenGroup()

    const defaultScale = 1 / scale

    for (const n of nodeRenderData) {
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
    renderLabels()
  }

  tweens.forEach((tween) => tween.stop())
  tweens.clear()

  const projection:GeoProjection = geoEqualEarth()
    .scale(150)
    .translate([width / 2, height / 2]);

  const labelsContainer   = new Container<Text>({ zIndex: 3, isRenderGroup: true })
  const nodesContainer    = new Container<Graphics>({ zIndex: 2, isRenderGroup: true })
  const mapContainer      = new Container<Graphics>({ zIndex: 1, isRenderGroup: true })

  const pathGenerator:GeoPath = geoPath().projection(projection);
  const svg = document.createElement("svg")
  const svgSelection = select(svg)
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
          .attr("stroke-width", 0.5)

    } catch (error) {
        console.error("Error loading GeoJSON:", error);
    }
  }

  await drawMap();

  const svgContext = new GraphicsContext().svg(svg.outerHTML)
  const mapGraphics = new Graphics(svgContext)

  mapContainer.addChild(mapGraphics)

  const app = new Application()
  await app.init({
    width: screen.width,
    height: screen.height,
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
  
  stage.addChild(mapContainer, nodesContainer, labelsContainer)


  for (const n of mapData.nodes) {
    const nodeId = n.id
    const targetAlpha = .85
    const [x, y] = projection([n.longitude,n.latitude]) ?? [0,0]
    
    const label = new Text({
      interactive: false,
      eventMode: "none",
      text: n.title,
      alpha: targetAlpha,
      anchor: { x: 0.5, y: 1.05 },
      style: {
        stroke: {
          color: '#000000',
          width:1,
        },
        align:"center",
        fontSize: fontSize * 5,
        fill: '#FF00FF', 
        fontFamily: computedStyleMap["--bodyFont"],
      },
      resolution: window.devicePixelRatio * 4,
      slug: nodeId,
      x:x,
      y:y
    })
    label.scale.set(1 / scale)

    let oldLabelOpacity = 0

    const gfx = new Graphics({
      interactive: true,
      label: nodeId,
      eventMode: "static",
      hitArea: new Circle(0, 0, nodeRadius(n)),
      cursor: "pointer",
      x: x,
      y: y
    })
      .circle(0, 0, nodeRadius(n))
      .fill({ color: "#FF00FF" })//color(n) })
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

  let currentTransform = zoomIdentity
  select<HTMLCanvasElement, MapNodeData | undefined>(app.canvas).call(
    drag<HTMLCanvasElement, MapNodeData | undefined>()
      .container(() => app.canvas)
      .subject(() => mapData.nodes.find((n) => n.id === hoveredNodeId))
      .on("start", function dragstarted(event) {
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
        event.subject.fx = null
        event.subject.fy = null
        dragging = false

        // if the time between mousedown and mouseup is short, we consider it a click
        if (Date.now() - dragStartTime < 500) {
          const node = mapData.nodes.find((n) => n.id === event.subject.id) as MapNodeData
          const sidebar = document.querySelector(".disctrict-map-sidebar")
          const title = sidebar?.querySelector("h2")
          const body  = sidebar?.querySelector("div")

          if (sidebar?.classList.contains("active")) {
            sidebar?.classList.remove("active")
            body?.replaceChildren() 
          }

          if (title !== null && title !== undefined) {
            if ( title.textContent !== node.title) {
              title.textContent = node.title
              sidebar?.classList.add("active")
              if (slug !== node.id) {
                node.bands.forEach( (value) => {
                  const list:HTMLLIElement = document.createElement('li')
                  const link: HTMLAnchorElement = document.createElement('a')

                  link.href = resolveRelative(fullSlug, value.slug)
                  link.textContent = value.title

                  list.appendChild(link)

                  body?.appendChild(list);
                })

              }
            } else {
              title.textContent = ""
            }
          }
        }
      }),
  )
  
  select<HTMLCanvasElement, MapNodeData>(app.canvas).call(
    zoom<HTMLCanvasElement, MapNodeData>()
      .extent([
        [0, 0],
        [width, height],
      ])
      .scaleExtent([0.25, 25])
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