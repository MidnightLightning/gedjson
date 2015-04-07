A NodeJS-based converter for translating [GEDCOM](http://en.wikipedia.org/wiki/GEDCOM) files into JSON, with Linked Data context as well.

# What?
The GEDCOM genealogy data [file format](https://familysearch.org/developers/docs/gedcom/gedcom55.pdf) is a text-based format, but defines a hierarchical structure (first value of each line of data is the "indent level" for that data) so very easily translates into a JSON structure, which in this booming age of REST APIs, lots of services understand more readily than GEDCOM files.

The [JSON-LD](http://json-ld.org) [specification](http://www.w3.org/TR/json-ld/) is an extension of JSON that adds context for associating the data with the Semantic Web/Linked Data web. This converter maps a few ontologies to various parameters in GEDCOM:

* [Friend of a Friend](http://xmlns.com/foaf/spec/) (`foaf`): People and common relations between them.
* [Relationship](http://purl.org/vocab/relationship) (`rel`): Deeper relationship terms for relating two people.
* [Biography](http://purl.org/vocab/bio/0.1/) (`bio`): Vocabulary for enumerating events in a person's life and participants in those events ([GitHub Source](https://github.com/iand/vocab-bio)).
* [Dublin Core](http://dublincore.org/documents/dcmi-terms/) (`dc`): Vocabulary for citing sources and dates.


# Usage

Output JSON:
```
node convert.js myFamilyTree.ged
```

Save JSON to a file:
```
node convert.js myFamilyTree.ged > myFamilyTree.json
```

The output structure of the `convert.js` script looks like:

```json
{
  "@context": {
    "foaf": "http://xmlns.com/foaf/0.1/",
    "rel": "http://purl.org/vocab/relationship",
    "bio": "http://purl.org/vocab/bio/0.1/",
    "dc": "http://purl.org/dc/elements/1.1/"
  },
  "@graph": [
    {
      "@id": "_:I101",
      "@type": "foaf:Person",
      "foaf:name": "John /Smith/",
      "foaf:gender": "M",
      "bio:event": {
        "@type": "bio:Birth",
        "DATE": "1 APR 1900",
        "bio:principal": {
          "@id": "_:I101"
        }
      },
      "bio:relationship": {
        "@id": "_:F101"
      }
    },
    {
      "@id": "_:F101",
      "@type": "bio:Relationship",
      "bio:participant": [
        {
          "@id": "_:I101"
        },
        {
          "@id": "_:I102"
        }
      ]
    }
  ]
}
```


# Don't care about Semantic data
Grab the `@graph` property from the result JSON, which is an array of JSON objects. Objects that have a `@type` property of `foaf:Person` are `INDI` objects in the original GEDCOM, and `@type` of `bio:Relationship` are `FAM` objects in the original file. Between those two types, all the properties of the original data file should be present.

# Mapping

* `CONT` items are concatenated onto their parent items with a line break
* `TIME` items are concatenated onto their parent `DATE` items with a space
* Events on an `INDI` have that individual as `bio:principal`

GEDCOM | Linked Data | Note
:--- | :--- | :---
`INDI` | `foaf:Person` |
`INDI.NAME` | `foaf:name` |
`INDI.SEX` | `foaf:gender` |
`INDI.BIRT` | `bio:Birth`
`INDI.CHR` | `bio:Baptism`
`INDI.CHRA` | `bio:Baptism`
`INDI.BAPM` | `bio:Baptism`
`INDI.BLES` | `bio:Baptism`
`INDI.DEAT` | `bio:Death`
`INDI.BURI` | `bio:Burial`
`INDI.CREM` | `bio:Cremation`
`INDI.ADOP` | `bio:Adoption`
`INDI.BARM` | `bio:BarMitzvah`
`INDI.BASM` | `bio:BasMitzvah`
`INDI.CONF` | `bio:IndividualEvent` | Confirmation
`INDI.FCOM` | `bio:IndividualEvent` | First Communion
`INDI.ORDN` | `bio:Ordination`
`INDI.NATU` | `bio:Naturalization`
`INDI.EMIG` | `bio:Emigration`
`INDI.IMMI` | `bio:IndividualEvent` | Immigration
`INDI.CENS` | `bio:GroupEvent` | Census
`INDI.PROB` | `bio:IndividualEvent` | Probate
`INDI.WILL` | `bio:IndividualEvent` | Will
`INDI.GRAD` | `bio:Graduation`
`INDI.RETI` | `bio:Retirement`
`INDI.EVEN` | `bio:IndividualEvent`
`FAM` | `bio:Relationship` |
`FAM.HUSB` | `bio:participant` | Both husband and wife become `bio:participant`s on the `FAM` Relationship; to find the gender, reference the related `foaf:Person`.
`FAM.WIFE` | `bio:participant` | Both husband and wife become `bio:participant`s on the `FAM` Relationship; to find the gender, reference the related `foaf:Person`.
`FAM.ANUL` | `bio:Annulment`
`FAM.CENS` | `bio:GroupEvent` | Census
`FAM.DIV` | `bio:Divorce`
`FAM.DIVF` | `bio:GroupEvent` | Divorce filed
`FAM.ENGA` | `bio:GroupEvent` | Engagement
`FAM.MARR` | `bio:Marriage`
`FAM.MARB` | `bio:GroupEvent` | Marriage Announcement
`FAM.MARC` | `bio:GroupEvent` | Marriage Contract
`FAM.MARL` | `bio:GroupEvent` | Marriage License
`FAM.MARS` | `bio:GroupEvent` | Marriage Settlement
`FAM.EVEN` | `bio:GroupEvent`
`DATE` | `dc:date` |
`SOUR` | `dc:source` | Property on an object that points to the Source object
`SOUR` | `dc:BibliographicResource` | Class that the above points to
`SOUR.DATA` | `dc:coverage` |
`SOUR.DATA.DATE` | `dc:temporal` |
`SOUR.AUTH` | `dc:creator` |
`SOUR.TITL` | `dc:title` |

# Linkages
The GEDCOM format links individuals through `FAM` objects, with the `HUSB`, `WIFE`, and `CHIL` references pointing to the various individuals, rather than individuals referencing each other. This is useful for drawing family tree diagrams, as the parents are usually arranged horizontally and joined to a central node, which the children's lines sprout from.

But for traversing person-to-person relationships, it adds a needless step. The conversion script adds `rel:childOf` `rel:siblingOf`, `rel:spouseOf`, and `rel:parentOf` to the individual (`foaf:Person`) objects, so `FAM`/`bio:Marriage` objects can be bypassed if desired. Where applicable, the more strict `bio:child`, `bio:father`, and `bio:mother` are used instead.

* `CHIL` tags are left on the `FAM` (`bio:Relationship`) object to preserve the data of which marriage a child came from.
* If the `FAM` object has an `ANUL` tag, no `rel:spouseOf` relations are generated. (TODO)
* If the `FAM` object has an `ENGA` tag, but no `MARR` tag, `rel:engagedTo` is used instead of `rel:spouseOf`.
* If the `FAM` object has no `ENGA` and no `MARR` tag, no `rel:spouseOf` or `rel:engagedTo` are created between the parents, but any children get the proper `rel:childOf` and `rel:siblingOf` relations added.
* If the `INDI` object has an `FAMC` tag with `PEDI` set to 'natural' or 'birth', `bio:child/father/mother` tags are used instead of `rel:childOf/parentOf`.
* If the `FAM.CHIL` object has `_MREL` or `_FREL` attributes (used by Family Tree Maker software to indicate pedigree) set to 'natural', `bio:child/father/mother` tags are used instead of `rel:childOf/parentOf`.

* If an `ANUL`, `DIV`, or `DIVF` exists on a `FAM` object, the `bio:concludingEvent` of that `bio:Marriage` is set to that event. If both `DIV` and `DIVF` exist, `DIV` takes precedence as the concluding event. (TODO)
* If one of the partners in a `bio:Marriage` has a Death event (or the first occurring Death if both are), that Death event is set as the `bio:concludingEvent` for the `bio:Marriage` if no `ANUL`, `DIV`, or `DIVF` exists. (TODO)
* If `DEAT` and `BURI` or `CREM` exist, `bio:followingEvent` and `bio:precedingEvent` relationships are added. (TODO)

The `INDI.FAMC.PEDI` (Pedigree) and `INDI.FAMC.STAT` (Status) tags break the standard relationship between an `INDI` and a `FAM` object. The `PEDI` and `STAT` attributes are not attributes of the `FAM` referenced by the `FAMC` ID, but rather attributes of the link that individual has with that family (reification of the link), which doesn't work well in JSON-LD. So, to get that to work properly, the `FAMC` property gets a new `ofFamily` attribute, which is set to the ID of the linked family, rather than the `FAMC` having that `@id` directly.

# Visualization ideas:
* [Pedigree tree](http://bl.ocks.org/mbostock/2966094): D3 "elbow dendrogram" using the "tree" D3 layout.
* [D3 smart force labels](http://bl.ocks.org/MoritzStefaner/1377729): Adding functinality to have labels "orbit" their node, and repel each other, so they stay out of each other's way.

# Other Resources
* [danbri blog post](http://danbri.org/words/2009/01/18/390)
* [GEDCOM files into D3](http://www.nowherenearithaca.com/2015/01/loading-gedcom-files-into-d3js-family.html)
