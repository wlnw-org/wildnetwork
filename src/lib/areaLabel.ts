/** Pure: shared by the area search route and the browser (older cached search results still carry raw tags). */
const ADDRESS_LABEL: Record<string, string> = {
  country: "Country", state: "State", province: "Province", region: "Region", state_district: "District", county: "District", district: "District",
  municipality: "Municipality", city: "City", town: "Town", village: "Village", hamlet: "Village", suburb: "Neighbourhood", city_district: "Neighbourhood", borough: "Neighbourhood",
};

/** A plain label for an OpenStreetMap tag pair ("boundary national_park" -> "National park"), shown in search results and translated in the browser. */
export function areaLabel(type: string, addresstype?: string): string {
  if (/national_park/.test(type)) return "National park";
  if (/wildlife|sanctuary/.test(type)) return "Wildlife sanctuary";
  if (/nature_reserve/.test(type)) return "Nature reserve";
  if (/protected_area|conservation/.test(type)) return "Protected area";
  if (addresstype && ADDRESS_LABEL[addresstype]) return ADDRESS_LABEL[addresstype];
  if (/forest|wood/.test(type)) return "Forest";
  if (/\b(city|town|village)\b/.test(type)) return type.match(/\b(city|town|village)\b/)![1].replace(/^./, (c) => c.toUpperCase());
  if (/administrative/.test(type)) return "Administrative area";
  return "Area";
}
