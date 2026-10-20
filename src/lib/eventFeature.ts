import { HIDDEN_DEPLOYMENT_SOURCES, creditFor, roundingFor, rules } from "@/lib/sources";

/** One map/API row as a GeoJSON feature. Empty fields are left out: the map fetches up to 20,000 of these every few minutes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toFeature(r: Record<string, any>) {
  const credit = creditFor(r.source_system, r.source_provider, r.source_provider_url);
  return {
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: r.source_system === "birdweather" ? [Math.round(r.longitude), Math.round(r.latitude)] : [r.longitude, r.latitude] },
    properties: Object.fromEntries(Object.entries({
      id: r.event_id,
      n: r.n > 1 ? r.n : null,
      t: r.event_start,
      sci: r.scientific_name,
      common: r.vernacular_name,
      rank: r.taxon_rank && r.taxon_rank !== "species" ? r.taxon_rank : null,
      conf: r.confidence == null ? null : Math.round(r.confidence * 100) / 100,
      human: r.observation_method === "human" ? true : null, // a person's identification: no model, no confidence
      model: r.confidence == null && r.observation_method !== "human" ? r.classifier_name : null, // a model that publishes no score
      delayed: rules(r.source_system)?.delayHours && (!rules(r.source_system)?.delayTaxa?.length || rules(r.source_system)?.delayTaxa?.includes(r.scientific_name)) ? rules(r.source_system)?.delayHours : null,
      rounded: roundingFor(r.source_system, r.scientific_name),
      count: r.individual_count,
      trusted: r.source_trusted,
      unmapped: r.observation_method === "human" && !r.scientific_name ? true : null, // common name the source table could not map
      credit: credit?.text,
      creditUrl: credit?.url,
      alsoCredit: r.also_credit, // the same occurrence also came from another aggregator
      license: r.license,
      source: r.source_system,
      // BirdWeather station identity stays with BirdWeather; hidden-position sources (Acartia) are named in `credit` instead.
      deployment: r.source_system === "birdweather" || HIDDEN_DEPLOYMENT_SOURCES.includes(r.source_system) ? null : r.deployment_id,
      media: r.media_url,
      mediaType: r.media_type,
      review: r.review_status === "unreviewed" ? null : r.review_status,
      group: r.grp,
    }).filter(([, v]) => v != null)),
  };
}
