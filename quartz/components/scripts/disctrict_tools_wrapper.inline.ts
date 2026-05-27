import { simplifySlug } from "../../util/path"
import { 
  addToVisited,
} from "./disctrict_tools/disctrict_utils"
import * as DisctrictGraph from "./disctrict_tools/disctrict_graph.inline"
import * as DisctrictJourney from "./disctrict_tools/disctrict_journey.inline"
import * as DisctrictExpand from "./disctrict_tools/disctrict_expand.inline"
import * as DisctrictMap from "./disctrict_tools/disctrict_map.inline"


document.addEventListener("nav", async (e: CustomEventMap["nav"]) => {
  const slug = e.detail.url

  addToVisited(simplifySlug(slug))

  async function prepareContainer() {
      DisctrictGraph.prepareUtilityContainer()
      DisctrictJourney.prepareUtilityContainer()
      DisctrictExpand.prepareUtilityContainer()
      DisctrictMap.prepareUtilityContainer()
  }

  async function renderTools() {
    DisctrictGraph.renderUtility(slug)
    DisctrictJourney.renderUtility(slug)
    DisctrictExpand.renderUtility(slug)
    DisctrictMap.renderUtility(slug)
  }
  
  async function cleanupTools() {
    DisctrictGraph.cleanupUtilityContainers()
    DisctrictJourney.cleanupUtilityContainers()
    DisctrictExpand.cleanupUtilityContainers()
    DisctrictMap.cleanupUtilityContainers()
  }

  await prepareContainer()
  await renderTools()

  const handleThemeChange = () => {
    void renderTools()
  }

  document.addEventListener("themechange", handleThemeChange)
  window.addCleanup(() => {
    document.removeEventListener("themechange", handleThemeChange)
  })

  window.addCleanup(() => {
    void cleanupTools()
  })
})
