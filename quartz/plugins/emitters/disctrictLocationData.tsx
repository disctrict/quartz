import { DisctrictBandLocationData } from "../transformers/disctrict_band_locations"
import { FullSlug, SimpleSlug, joinSegments, simplifySlug } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import { write } from "./helpers"
import NodeGeocoder, { Entry } from "node-geocoder"

export type DisctrictLocationMap = Map<string, DisctrictLocationDetails>
export type DisctrictLocationDetails = {
  [key: string]: LocationData
}

type LocationData = {
  locationName: string[]
  title: string[]
  slug: SimpleSlug
  bands: []
  [key: string]: any
}

type BandData = {
  slug: SimpleSlug
  title: string[] | undefined
}

interface Options {
}

const defaultOptions: Options = {
}


const geocoder = NodeGeocoder({'provider': 'openstreetmap'})

export const DisctrictLocationData: QuartzEmitterPlugin<Partial<Options>> = (opts) => {
  opts = { ...defaultOptions, ...opts }
  return {
    name: "DisctrictLocationData",
    async *emit(ctx, content) {
      const locationMap:LocationData = {} as LocationData
      const locationCache:Map<string, string> = new Map<string, string>()
      const cityCache:Map<string, string> = new Map<string, string>()

      for (const [_tree, file] of content) {
        const geoData:DisctrictBandLocationData = file.data.disctrictBandLocations as DisctrictBandLocationData
        const location:string[] = geoData.location
        const slug = file.data.slug!
        const title = geoData.title
        let latLongKey:string = ""
        let placeName:string = ""

        if (location === undefined ) {
          continue
        }

        if ( locationCache.has(location.toString()) ) {
          latLongKey = locationCache.get(location.toString()) ?? "0,0"
          placeName  = cityCache.get(location.toString()) ?? "MISSING LOCATION NAME"
        } else {
          const geoData:Entry[] = await geocoder.geocode(location.toString())
          const latitude = geoData[0].latitude
          const longitude = geoData[0].longitude
          const cityName = geoData[0].city

          if ( latitude === undefined && longitude === undefined) {
            continue
          }
          
          placeName = cityName ?? "MISSING LOCATION NAME"
          latLongKey = latitude?.toString() + "," + longitude?.toString()
          locationCache.set(location.toString(), latLongKey)

          cityCache.set(location.toString(), placeName)
        }

        if ( !(latLongKey in locationMap )) {
          locationMap[latLongKey] = {} as LocationData
          locationMap[latLongKey]['title'] = placeName
          locationMap[latLongKey]['slug' ] = "/Location/" + encodeURIComponent(latLongKey)
          locationMap[latLongKey]['bands'] = []
        }

        const dataPoint:BandData = {
          slug: simplifySlug(slug),
          title: title
        }
                
        if ( !(locationMap[latLongKey]['bands'].includes(dataPoint)) ) {
          locationMap[latLongKey]['bands'].push(dataPoint) 
        }
      }

      const fp = joinSegments("static", "disctrictBandLocationData") as FullSlug

      yield write({
        ctx,
        content: JSON.stringify(locationMap),
        slug: fp,
        ext: ".json",
      })
    },
  }
}
