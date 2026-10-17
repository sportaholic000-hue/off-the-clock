# Proposed labels and wording — October 16

These are explicit wording proposals shipped on this implementation branch for owner review; no separate owner approval of the new copy is claimed. Existing general labels and the existing additional-work/on-site copy are reused. Example height limits in this inventory are synthetic metadata inspection inputs, never starting values.

## Customer questions

The following complete contract inventory covers new field labels, units, help text, method choices, row labels and siding variants. The differing soffit choice is “Soffit to install (linear feet)” when the owner selects that unit. Enum choices good/fair/poor and existing Standard/High/Vaulted remain unchanged.

### INTERIOR_PAINTING

```json
{
  "areaInputMethod": {
    "label": "Wall area measurement method",
    "type": "enum",
    "unit": null,
    "values": [
      "wall_sqft",
      "room_dimensions"
    ],
    "optionLabels": {
      "sqft": "Enter siding wall area directly",
      "wall_sqft": "Enter wall area directly",
      "room_dimensions": "Room length, width and height",
      "building_dimensions": "House perimeter and wall height"
    },
    "details": [
      "Changing measurement methods clears the other method's measurements. Enter gables separately only when they are not included in the direct area."
    ]
  },
  "wallAreaSqft": {
    "label": "Measured paintable wall area",
    "unit": "square feet",
    "type": "number",
    "min": 1,
    "max": 2000000,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ],
    "details": [
      "If you supply opening counts or areas, enter wall area before subtracting those openings. Without opening inputs, your existing directly entered area is used unchanged."
    ]
  },
  "wallHeight": {
    "label": "Wall height",
    "unit": null,
    "type": "enum",
    "values": [
      "standard",
      "high",
      "vaulted"
    ]
  },
  "surfaceCondition": {
    "label": "Wall surface condition",
    "unit": null,
    "type": "enum",
    "values": [
      "good",
      "fair",
      "poor"
    ]
  },
  "coats": {
    "label": "Wall finish coats",
    "unit": "coats",
    "type": "number",
    "min": 1,
    "max": 3,
    "integer": true
  },
  "ceilingsIncluded": {
    "label": "Ceilings included",
    "unit": null,
    "type": "boolean"
  },
  "ceilingAreaSqft": {
    "label": "Measured ceiling area",
    "unit": "square feet",
    "type": "number",
    "min": 1,
    "max": 1000000,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ],
        [
          "ceilingsIncluded",
          "eq",
          true
        ]
      ]
    ]
  },
  "trimIncluded": {
    "label": "Trim included",
    "unit": null,
    "type": "boolean"
  },
  "trimLengthLF": {
    "label": "Measured trim length",
    "unit": "linear feet",
    "type": "number",
    "min": 0.1,
    "max": 1000000
  },
  "permitRequired": {
    "label": "Permit required for this measured project",
    "unit": null,
    "type": "boolean"
  },
  "wallScopeUniform": {
    "label": "All wall area shares the confirmed height, access, and finish-coat count",
    "unit": null,
    "type": "boolean",
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ]
  },
  "ceilingCoats": {
    "label": "Ceiling finish coats",
    "unit": "coats",
    "type": "number",
    "min": 1,
    "max": 3,
    "integer": true,
    "visibleWhen": [
      [
        [
          "ceilingsIncluded",
          "eq",
          true
        ]
      ]
    ]
  },
  "rooms": {
    "label": "Room measurements",
    "type": "surface_rows",
    "unit": null,
    "rowFields": {
      "lengthFeet": {
        "label": "Room length",
        "unit": "feet",
        "type": "number",
        "min": 0.01,
        "max": 10000
      },
      "widthFeet": {
        "label": "Room width",
        "unit": "feet",
        "type": "number",
        "min": 0.01,
        "max": 10000
      },
      "heightFeet": {
        "label": "Ceiling height",
        "unit": "feet",
        "type": "number",
        "min": 0.01,
        "max": 1000
      },
      "doorCount": {
        "label": "Door openings",
        "unit": "doors",
        "type": "number",
        "min": 0,
        "max": 10000,
        "integer": true
      },
      "windowCount": {
        "label": "Window openings",
        "unit": "windows",
        "type": "number",
        "min": 0,
        "max": 10000,
        "integer": true
      },
      "largeOpenings": {
        "label": "Large room openings",
        "type": "surface_rows",
        "unit": null,
        "rowFields": {
          "areaSqft": {
            "label": "Opening area",
            "unit": "square feet",
            "type": "number",
            "min": 0.01,
            "max": 2000000
          }
        },
        "minRows": 0,
        "maxRows": 100,
        "optional": true,
        "details": [
          "Only openings not counted as doors or windows. Openings over 100 square feet are removed from labor; all listed openings are removed from paint quantity."
        ]
      }
    },
    "minRows": 1,
    "maxRows": 100,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "room_dimensions"
        ]
      ]
    ]
  },
  "largeOpenings": {
    "label": "Other openings",
    "type": "surface_rows",
    "unit": null,
    "rowFields": {
      "areaSqft": {
        "label": "Other opening area not counted above",
        "unit": "square feet",
        "type": "number",
        "min": 0.01,
        "max": 2000000
      }
    },
    "minRows": 0,
    "maxRows": 100,
    "details": [
      "Only openings not already counted as doors, windows or garage doors. Openings over 100 square feet are removed from painting labor; all listed openings are removed from paint quantity."
    ],
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "room_dimensions"
        ]
      ],
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ],
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ]
  },
  "doorCount": {
    "label": "Door openings",
    "unit": "openings",
    "type": "number",
    "min": 0,
    "max": 10000,
    "integer": true,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ]
  },
  "windowCount": {
    "label": "Window openings",
    "unit": "openings",
    "type": "number",
    "min": 0,
    "max": 10000,
    "integer": true,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ]
  },
  "ceilingSurfaceCondition": {
    "label": "Ceiling surface condition",
    "type": "enum",
    "unit": null,
    "values": [
      "good",
      "fair",
      "poor"
    ],
    "visibleWhen": [
      [
        [
          "ceilingsIncluded",
          "eq",
          true
        ]
      ]
    ]
  },
  "trimCoats": {
    "label": "Trim finish coats",
    "unit": "coats",
    "type": "number",
    "min": 1,
    "max": 3,
    "integer": true,
    "visibleWhen": [
      [
        [
          "trimIncluded",
          "eq",
          true
        ]
      ]
    ]
  },
  "trimSurfaceCondition": {
    "label": "Trim surface condition",
    "type": "enum",
    "unit": null,
    "values": [
      "good",
      "fair",
      "poor"
    ],
    "visibleWhen": [
      [
        [
          "trimIncluded",
          "eq",
          true
        ]
      ]
    ]
  },
  "paintDoorSides": {
    "label": "Door sides to paint",
    "unit": "each",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "integer": true,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "paintDoorFrames": {
    "label": "Door frames to paint",
    "unit": "each",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "integer": true,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "paintWindows": {
    "label": "Windows to paint",
    "unit": "each",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "integer": true,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "paintCabinetFaces": {
    "label": "Cabinet doors or drawer faces to paint",
    "unit": "each",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "integer": true,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  }
}
```

### INTERIOR_PAINTING — owner bands

```json
{
  "areaInputMethod": {
    "label": "Wall area measurement method",
    "type": "enum",
    "unit": null,
    "values": [
      "wall_sqft",
      "room_dimensions"
    ],
    "optionLabels": {
      "sqft": "Enter siding wall area directly",
      "wall_sqft": "Enter wall area directly",
      "room_dimensions": "Room length, width and height",
      "building_dimensions": "House perimeter and wall height"
    },
    "details": [
      "Changing measurement methods clears the other method's measurements. Enter gables separately only when they are not included in the direct area."
    ]
  },
  "wallAreaSqft": {
    "label": "Measured paintable wall area",
    "unit": "square feet",
    "type": "number",
    "min": 1,
    "max": 2000000,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ],
    "details": [
      "If you supply opening counts or areas, enter wall area before subtracting those openings. Without opening inputs, your existing directly entered area is used unchanged."
    ]
  },
  "wallHeight": {
    "label": "Wall height",
    "unit": null,
    "type": "enum",
    "values": [
      "standard",
      "high",
      "vaulted"
    ],
    "visibleWhen": []
  },
  "surfaceCondition": {
    "label": "Wall surface condition",
    "unit": null,
    "type": "enum",
    "values": [
      "good",
      "fair",
      "poor"
    ]
  },
  "coats": {
    "label": "Wall finish coats",
    "unit": "coats",
    "type": "number",
    "min": 1,
    "max": 3,
    "integer": true
  },
  "ceilingsIncluded": {
    "label": "Ceilings included",
    "unit": null,
    "type": "boolean"
  },
  "ceilingAreaSqft": {
    "label": "Measured ceiling area",
    "unit": "square feet",
    "type": "number",
    "min": 1,
    "max": 1000000,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ],
        [
          "ceilingsIncluded",
          "eq",
          true
        ]
      ]
    ]
  },
  "trimIncluded": {
    "label": "Trim included",
    "unit": null,
    "type": "boolean"
  },
  "trimLengthLF": {
    "label": "Measured trim length",
    "unit": "linear feet",
    "type": "number",
    "min": 0.1,
    "max": 1000000
  },
  "permitRequired": {
    "label": "Permit required for this measured project",
    "unit": null,
    "type": "boolean"
  },
  "wallScopeUniform": {
    "label": "All wall area shares the confirmed height, access, and finish-coat count",
    "unit": null,
    "type": "boolean",
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ]
  },
  "ceilingCoats": {
    "label": "Ceiling finish coats",
    "unit": "coats",
    "type": "number",
    "min": 1,
    "max": 3,
    "integer": true,
    "visibleWhen": [
      [
        [
          "ceilingsIncluded",
          "eq",
          true
        ]
      ]
    ]
  },
  "rooms": {
    "label": "Room measurements",
    "type": "surface_rows",
    "unit": null,
    "rowFields": {
      "lengthFeet": {
        "label": "Room length",
        "unit": "feet",
        "type": "number",
        "min": 0.01,
        "max": 10000
      },
      "widthFeet": {
        "label": "Room width",
        "unit": "feet",
        "type": "number",
        "min": 0.01,
        "max": 10000
      },
      "heightFeet": {
        "label": "Ceiling height",
        "unit": "feet",
        "type": "number",
        "min": 0.01,
        "max": 1000
      },
      "doorCount": {
        "label": "Door openings",
        "unit": "doors",
        "type": "number",
        "min": 0,
        "max": 10000,
        "integer": true
      },
      "windowCount": {
        "label": "Window openings",
        "unit": "windows",
        "type": "number",
        "min": 0,
        "max": 10000,
        "integer": true
      },
      "largeOpenings": {
        "label": "Large room openings",
        "type": "surface_rows",
        "unit": null,
        "rowFields": {
          "areaSqft": {
            "label": "Opening area",
            "unit": "square feet",
            "type": "number",
            "min": 0.01,
            "max": 2000000
          }
        },
        "minRows": 0,
        "maxRows": 100,
        "optional": true,
        "details": [
          "Only openings not counted as doors or windows. Openings over 100 square feet are removed from labor; all listed openings are removed from paint quantity."
        ]
      }
    },
    "minRows": 1,
    "maxRows": 100,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "room_dimensions"
        ]
      ]
    ]
  },
  "largeOpenings": {
    "label": "Other openings",
    "type": "surface_rows",
    "unit": null,
    "rowFields": {
      "areaSqft": {
        "label": "Other opening area not counted above",
        "unit": "square feet",
        "type": "number",
        "min": 0.01,
        "max": 2000000
      }
    },
    "minRows": 0,
    "maxRows": 100,
    "details": [
      "Only openings not already counted as doors, windows or garage doors. Openings over 100 square feet are removed from painting labor; all listed openings are removed from paint quantity."
    ],
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "room_dimensions"
        ]
      ],
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ],
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ]
  },
  "doorCount": {
    "label": "Door openings",
    "unit": "openings",
    "type": "number",
    "min": 0,
    "max": 10000,
    "integer": true,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ]
  },
  "windowCount": {
    "label": "Window openings",
    "unit": "openings",
    "type": "number",
    "min": 0,
    "max": 10000,
    "integer": true,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ]
  },
  "wallHeightFeet": {
    "label": "Wall height",
    "unit": "feet",
    "type": "number",
    "min": 0.01,
    "max": 1000,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ]
  },
  "ceilingSurfaceCondition": {
    "label": "Ceiling surface condition",
    "type": "enum",
    "unit": null,
    "values": [
      "good",
      "fair",
      "poor"
    ],
    "visibleWhen": [
      [
        [
          "ceilingsIncluded",
          "eq",
          true
        ]
      ]
    ]
  },
  "trimCoats": {
    "label": "Trim finish coats",
    "unit": "coats",
    "type": "number",
    "min": 1,
    "max": 3,
    "integer": true,
    "visibleWhen": [
      [
        [
          "trimIncluded",
          "eq",
          true
        ]
      ]
    ]
  },
  "trimSurfaceCondition": {
    "label": "Trim surface condition",
    "type": "enum",
    "unit": null,
    "values": [
      "good",
      "fair",
      "poor"
    ],
    "visibleWhen": [
      [
        [
          "trimIncluded",
          "eq",
          true
        ]
      ]
    ]
  },
  "paintDoorSides": {
    "label": "Door sides to paint",
    "unit": "each",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "integer": true,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "paintDoorFrames": {
    "label": "Door frames to paint",
    "unit": "each",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "integer": true,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "paintWindows": {
    "label": "Windows to paint",
    "unit": "each",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "integer": true,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "paintCabinetFaces": {
    "label": "Cabinet doors or drawer faces to paint",
    "unit": "each",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "integer": true,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  }
}
```

### EXTERIOR_PAINTING

```json
{
  "permitRequired": {
    "label": "Permit required for this measured project",
    "unit": null,
    "type": "boolean"
  },
  "areaInputMethod": {
    "label": "Wall area measurement method",
    "type": "enum",
    "unit": null,
    "values": [
      "wall_sqft",
      "building_dimensions"
    ],
    "optionLabels": {
      "sqft": "Enter siding wall area directly",
      "wall_sqft": "Enter wall area directly",
      "room_dimensions": "Room length, width and height",
      "building_dimensions": "House perimeter and wall height"
    },
    "details": [
      "Changing measurement methods clears the other method's measurements. Enter gables separately only when they are not included in the direct area."
    ]
  },
  "exteriorAreaSqft": {
    "label": "Measured paintable wall area",
    "unit": "square feet",
    "type": "number",
    "min": 1,
    "max": 2000000,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ],
    "details": [
      "If you supply opening counts or areas, enter wall area before subtracting those openings. Without opening inputs, your existing directly entered area is used unchanged."
    ]
  },
  "coats": {
    "label": "Wall finish coats",
    "unit": "coats",
    "type": "number",
    "min": 1,
    "max": 3,
    "integer": true
  },
  "surfaceCondition": {
    "label": "Wall surface condition",
    "unit": null,
    "type": "enum",
    "values": [
      "good",
      "fair",
      "poor"
    ]
  },
  "stories": {
    "label": "Building stories",
    "unit": null,
    "type": "enum",
    "values": [
      1,
      2,
      3
    ]
  },
  "buildingPerimeterFeet": {
    "label": "House perimeter",
    "unit": "feet",
    "type": "number",
    "min": 0.01,
    "max": 1000000,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ]
    ]
  },
  "gables": {
    "label": "Gable triangles",
    "type": "surface_rows",
    "unit": null,
    "rowFields": {
      "widthFeet": {
        "label": "Gable width",
        "unit": "feet",
        "type": "number",
        "min": 0.01,
        "max": 10000
      },
      "heightFeet": {
        "label": "Gable height",
        "unit": "feet",
        "type": "number",
        "min": 0.01,
        "max": 1000
      }
    },
    "minRows": 0,
    "maxRows": 100,
    "details": [
      "Enter each gable separately. Its width × height ÷ 2 is added once; leave these triangles out of any direct area entered above."
    ],
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ],
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ]
  },
  "doorCount": {
    "label": "Door openings",
    "unit": "openings",
    "type": "number",
    "min": 0,
    "max": 10000,
    "integer": true,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ],
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ]
  },
  "windowCount": {
    "label": "Window openings",
    "unit": "openings",
    "type": "number",
    "min": 0,
    "max": 10000,
    "integer": true,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ],
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ]
  },
  "garageDoorCount": {
    "label": "Garage-door openings",
    "unit": "openings",
    "type": "number",
    "min": 0,
    "max": 10000,
    "integer": true,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ],
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ]
  },
  "garageDoorWidthFeet": {
    "label": "Width of each garage-door opening",
    "unit": "feet",
    "type": "number",
    "min": 0.01,
    "max": 1000000,
    "visibleWhen": [
      [
        [
          "garageDoorCount",
          "gt",
          0
        ]
      ]
    ]
  },
  "garageDoorHeightFeet": {
    "label": "Height of each garage-door opening",
    "unit": "feet",
    "type": "number",
    "min": 0.01,
    "max": 1000000,
    "visibleWhen": [
      [
        [
          "garageDoorCount",
          "gt",
          0
        ]
      ]
    ]
  },
  "garageOpenings": {
    "label": "Individual garage-door openings",
    "type": "surface_rows",
    "unit": null,
    "rowFields": {
      "widthFeet": {
        "label": "Garage opening width",
        "unit": "feet",
        "type": "number",
        "min": 0.01,
        "max": 10000
      },
      "heightFeet": {
        "label": "Garage opening height",
        "unit": "feet",
        "type": "number",
        "min": 0.01,
        "max": 1000
      }
    },
    "minRows": 1,
    "maxRows": 100,
    "details": [
      "Use this list when opening sizes differ; otherwise enter the shared width and height above. Do not use both."
    ],
    "visibleWhen": [
      [
        [
          "garageDoorCount",
          "gt",
          0
        ]
      ]
    ]
  },
  "largeOpenings": {
    "label": "Other openings",
    "type": "surface_rows",
    "unit": null,
    "rowFields": {
      "areaSqft": {
        "label": "Other opening area not counted above",
        "unit": "square feet",
        "type": "number",
        "min": 0.01,
        "max": 2000000
      }
    },
    "minRows": 0,
    "maxRows": 100,
    "details": [
      "Only openings not already counted as doors, windows or garage doors. Openings over 100 square feet are removed from painting labor; all listed openings are removed from paint quantity."
    ],
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "room_dimensions"
        ]
      ],
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ],
      [
        [
          "areaInputMethod",
          "eq",
          "wall_sqft"
        ]
      ]
    ]
  },
  "wallHeightFeet": {
    "label": "Wall height to the eaves",
    "unit": "feet",
    "type": "number",
    "min": 0.01,
    "max": 1000,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ]
    ]
  },
  "paintWindows": {
    "label": "Windows to paint",
    "unit": "each",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "integer": true,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "paintDoors": {
    "label": "Doors to paint",
    "unit": "each",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "integer": true,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "paintShutters": {
    "label": "Shutters to paint",
    "unit": "each",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "integer": true,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "paintGarageDoors": {
    "label": "Garage doors to paint",
    "unit": "each",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "integer": true,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "exteriorTrimLengthLF": {
    "label": "Exterior trim to paint",
    "unit": "linear feet",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "soffitQuantity": {
    "label": "Soffit to paint",
    "unit": "linear feet",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "fasciaLengthLF": {
    "label": "Fascia to paint",
    "unit": "linear feet",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "powerWashingAreaSqft": {
    "label": "Power-washing area",
    "unit": "square feet",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  }
}
```

### SIDING_REPLACEMENT — convention examples

```json
{
  "areaInputMethod": {
    "label": "Siding area measurement method",
    "type": "enum",
    "unit": null,
    "values": [
      "sqft",
      "building_dimensions"
    ],
    "optionLabels": {
      "sqft": "Enter siding wall area directly",
      "wall_sqft": "Enter wall area directly",
      "room_dimensions": "Room length, width and height",
      "building_dimensions": "House perimeter and wall height"
    },
    "details": [
      "Changing measurement methods clears the other method's measurements. Enter gables separately only when they are not included in the direct area."
    ]
  },
  "sidingAreaSqft": {
    "label": "Measured siding wall area",
    "unit": "square feet",
    "type": "number",
    "min": 1,
    "max": 2000000,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "sqft"
        ]
      ]
    ],
    "details": [
      "Use the convention saved for the selected siding rate. Gable triangles entered separately are added once."
    ],
    "presentationVariants": [
      {
        "label": "Siding wall area — Openings left in (VSI, CertainTeed)",
        "details": [
          "Leave ordinary door and window openings in. Subtract half the area of openings over 100 square feet, including large garage openings.",
          "Include gable area (width × height ÷ 2), or enter its triangle separately below and leave it out of this direct area."
        ],
        "visibleWhen": [
          [
            [
              "sidingType",
              "eq",
              "vinyl"
            ]
          ]
        ]
      },
      {
        "label": "Siding wall area — Openings subtracted (LP)",
        "details": [
          "Subtract 15 square feet per window, 20 per door and the full area of garage doors and other openings.",
          "Include gable area (width × height ÷ 2), or enter its triangle separately below and leave it out of this direct area."
        ],
        "visibleWhen": [
          [
            [
              "sidingType",
              "eq",
              "fiber_cement"
            ]
          ]
        ]
      }
    ]
  },
  "sidingType": {
    "label": "Siding type",
    "unit": null,
    "type": "enum",
    "values": [
      "vinyl",
      "fiber_cement",
      "wood",
      "metal"
    ]
  },
  "stories": {
    "label": "Building stories",
    "unit": null,
    "type": "enum",
    "values": [
      1,
      2,
      3
    ]
  },
  "oldSidingRemoval": {
    "label": "Old siding removal included",
    "unit": null,
    "type": "boolean"
  },
  "trimIncluded": {
    "label": "Siding trim included",
    "unit": null,
    "type": "boolean"
  },
  "trimLengthLF": {
    "label": "Measured siding trim length",
    "unit": "linear feet",
    "type": "number",
    "min": 0.1,
    "max": 1000000
  },
  "permitRequired": {
    "label": "Permit required for this measured project",
    "unit": null,
    "type": "boolean"
  },
  "buildingPerimeterFeet": {
    "label": "House perimeter",
    "unit": "feet",
    "type": "number",
    "min": 0.01,
    "max": 1000000,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ]
    ]
  },
  "gables": {
    "label": "Gable triangles",
    "type": "surface_rows",
    "unit": null,
    "rowFields": {
      "widthFeet": {
        "label": "Gable width",
        "unit": "feet",
        "type": "number",
        "min": 0.01,
        "max": 10000
      },
      "heightFeet": {
        "label": "Gable height",
        "unit": "feet",
        "type": "number",
        "min": 0.01,
        "max": 1000
      }
    },
    "minRows": 0,
    "maxRows": 100,
    "details": [
      "Enter each gable separately. Its width × height ÷ 2 is added once; leave these triangles out of any direct area entered above."
    ],
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ],
      [
        [
          "areaInputMethod",
          "eq",
          "sqft"
        ]
      ]
    ]
  },
  "doorCount": {
    "label": "Door openings",
    "unit": "openings",
    "type": "number",
    "min": 0,
    "max": 10000,
    "integer": true,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ]
    ]
  },
  "windowCount": {
    "label": "Window openings",
    "unit": "openings",
    "type": "number",
    "min": 0,
    "max": 10000,
    "integer": true,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ]
    ]
  },
  "garageDoorCount": {
    "label": "Garage-door openings",
    "unit": "openings",
    "type": "number",
    "min": 0,
    "max": 10000,
    "integer": true,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ]
    ]
  },
  "garageDoorWidthFeet": {
    "label": "Width of each garage-door opening",
    "unit": "feet",
    "type": "number",
    "min": 0.01,
    "max": 1000000,
    "visibleWhen": [
      [
        [
          "garageDoorCount",
          "gt",
          0
        ]
      ]
    ]
  },
  "garageDoorHeightFeet": {
    "label": "Height of each garage-door opening",
    "unit": "feet",
    "type": "number",
    "min": 0.01,
    "max": 1000000,
    "visibleWhen": [
      [
        [
          "garageDoorCount",
          "gt",
          0
        ]
      ]
    ]
  },
  "garageOpenings": {
    "label": "Individual garage-door openings",
    "type": "surface_rows",
    "unit": null,
    "rowFields": {
      "widthFeet": {
        "label": "Garage opening width",
        "unit": "feet",
        "type": "number",
        "min": 0.01,
        "max": 10000
      },
      "heightFeet": {
        "label": "Garage opening height",
        "unit": "feet",
        "type": "number",
        "min": 0.01,
        "max": 1000
      }
    },
    "minRows": 1,
    "maxRows": 100,
    "details": [
      "Use this list when opening sizes differ; otherwise enter the shared width and height above. Do not use both."
    ],
    "visibleWhen": [
      [
        [
          "garageDoorCount",
          "gt",
          0
        ]
      ]
    ]
  },
  "largeOpenings": {
    "label": "Other openings",
    "type": "surface_rows",
    "unit": null,
    "rowFields": {
      "areaSqft": {
        "label": "Other opening area not counted above",
        "unit": "square feet",
        "type": "number",
        "min": 0.01,
        "max": 2000000
      }
    },
    "minRows": 0,
    "maxRows": 100,
    "details": [
      "Only openings not already counted as doors, windows or garage doors. Openings over 100 square feet are removed from painting labor; all listed openings are removed from paint quantity."
    ],
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "room_dimensions"
        ]
      ],
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ]
    ]
  },
  "wallHeightFeet": {
    "label": "Wall height to the eaves",
    "unit": "feet",
    "type": "number",
    "min": 0.01,
    "max": 1000,
    "visibleWhen": [
      [
        [
          "areaInputMethod",
          "eq",
          "building_dimensions"
        ]
      ]
    ]
  },
  "soffitQuantity": {
    "label": "Soffit to install",
    "unit": "square feet",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "fasciaLengthLF": {
    "label": "Fascia to install",
    "unit": "linear feet",
    "type": "number",
    "min": 0,
    "max": 1000000,
    "details": [
      "Optional. If the owner has not priced this work, it is excluded and needs a separate estimate."
    ]
  },
  "existingSidingType": {
    "type": "slug",
    "label": "Existing siding type to remove",
    "unit": null,
    "visibleWhen": [
      [
        [
          "oldSidingRemoval",
          "eq",
          true
        ]
      ]
    ]
  },
  "sidingRemovalAreaSqft": {
    "type": "number",
    "label": "Measured existing siding removal area",
    "unit": "square feet",
    "min": 0.1,
    "max": 10000000,
    "visibleWhen": [
      [
        [
          "oldSidingRemoval",
          "eq",
          true
        ]
      ]
    ]
  },
  "sidingRemovalStories": {
    "type": "enum",
    "label": "Stories of the existing siding removal",
    "values": [
      1,
      2,
      3
    ],
    "unit": null,
    "visibleWhen": [
      [
        [
          "oldSidingRemoval",
          "eq",
          true
        ]
      ]
    ]
  }
}
```

## Owner fields

- Walls — additional-coat labor ratio
- Ceilings — additional-coat labor ratio
- Trim — additional-coat labor ratio
- Wall primer — additional-coat labor ratio
- Ceiling primer — additional-coat labor ratio
- Trim primer — additional-coat labor ratio
- Wall primer labor per square foot per coat
- Wall primer material per square foot per coat
- Ceiling primer labor per square foot per coat
- Ceiling primer material per square foot per coat
- Trim labor per linear foot per coat
- Trim material per linear foot per coat
- Trim primer labor per linear foot per coat
- Trim primer material per linear foot per coat
- good trim preparation labor per linear foot
- good trim preparation material per linear foot
- fair trim preparation labor per linear foot
- fair trim preparation material per linear foot
- poor trim preparation labor per linear foot
- poor trim preparation material per linear foot
- INTERIOR_PAINTING: Door sides — complete installed price per each
- INTERIOR_PAINTING: Door frames — complete installed price per each
- INTERIOR_PAINTING: Windows — complete installed price per each
- INTERIOR_PAINTING: Cabinet doors or drawer faces — complete installed price per each
- EXTERIOR_PAINTING: Windows — complete installed price per each
- EXTERIOR_PAINTING: Doors — complete installed price per each
- EXTERIOR_PAINTING: Shutters — complete installed price per each
- EXTERIOR_PAINTING: Garage doors — complete installed price per each
- EXTERIOR_PAINTING: Exterior trim — complete installed price per linear feet
- EXTERIOR_PAINTING: Soffit — complete installed price per linear feet
- EXTERIOR_PAINTING: Fascia — complete installed price per linear feet
- EXTERIOR_PAINTING: Power washing — complete installed price per square feet
- SIDING_REPLACEMENT: Soffit — complete installed price per square feet or per linear feet, according to the owner selection
- SIDING_REPLACEMENT: Fascia — complete installed price per linear feet

## Owner headings, help and derived-price display

- Painting and siding measurements and extras
- Coats and measured surfaces
- Leave an additional-coat ratio blank to keep your current per-coat labor price. Setting a ratio converts that price into first-coat and additional-coat prices while keeping its unrounded two-coat labor price. Each extended coat line is rounded separately, so some totals can differ by one cent. Materials stay per coat. No starting ratios are supplied.
- First-coat labor per unit: {derived price}. Each additional coat: {derived price}. Display uses the same currency as your prices; extended lines retain fractional unit prices.
- Wall-height bands in feet
- Leave all bands blank to keep Standard / High / Vaulted and their current adjustments. When you enter bands, customers give a height in feet. Each upper limit is included in its band.
- Standard — maximum height in feet; High — maximum height in feet; Vaulted — maximum height in feet
- Additional painting component prices
- These are optional prices per coat. For per-coat trim, enter both trim labor and material prices to replace the retained trim price in basic or itemized painting. Preparation prices are separate and follow the trim's condition.
- Wall primer coats included; Ceiling primer coats included; Trim primer coats included
- Siding area conventions
- Choose the convention used to set each siding rate. Direct area remains available. Dimension-based quotes require a saved convention; no convention is guessed for an existing rate.
- vinyl — area convention; fiber cement — area convention; wood — area convention; metal — area convention
- Not set; Openings left in (VSI, CertainTeed); Openings subtracted (LP)
- Soffit price unit; Square feet; Linear feet
- Optional complete installed prices
- Leave a price blank when you have not priced that work. If requested, it is excluded from the rest of the quote and needs its own estimate. These prices include the complete item; no separate material or labor adjustment is added.
- Ceiling condition covered
- Finish coats covered by the installed trim price
- Condition covered by the installed trim price
- Painting coats and height bands; Optional surface work prices; Siding measurement conventions
- Optional owner-entered settings. No starting ratios or prices are supplied.

The existing offering editor still labels its original installed trim definition “Trim coats, preparation and primer included”. New per-coat component fields are alternatives to that complete installed trim price, not extra charges on top.

## Repeated measurement controls

Rows use the field/row labels in the contract inventory. Buttons are “Add {lowercase row group label}”, “Remove {lowercase row group label} {row number}” and, for zero-row groups, “No {lowercase row group label}”. Legends show “{row group label} {row number}”; individual inputs show “{row-field label} ({unit})”. The safe phone contract explains: “Supply an array of rows. Each row contains: {key = label (unit); …}. Use an empty array only when there are none.” These are tool-input names and measurement labels, with no prices or ratios.

## Quote presentation and receptionist guidance

New excluded-work sentence: “{item label} is excluded and needs a separate on-site estimate.” The application then uses its existing partial-estimate/additional-work presentation, including: “The business owner will estimate this additional work on site and agree its price with you before that work starts. It is not included in the estimate for the selected service.” The existing on-site line is reused unchanged: “This price is based on the measurements you gave us. The business will confirm them on site.” No new repair wording is introduced.

Internal owner calculation line suffixes are “— first coat”, “— additional coats” and “— ceilings”; calculation labels include “First-coat price conversion”, “Additional-coat price conversion” and “Wall area from supplied dimensions”. These do not enter voice-agent pricing inputs. New basic primer/preparation line names are “Wall primer labor”, “Wall primer materials”, “Ceiling primer labor”, “Ceiling primer materials”, “Trim primer labor”, “Trim primer materials”, “Trim preparation labor” and “Trim preparation material”. Product configuration adds “Trim primer materials”.

The full painting- and siding-specific receptionist instructions are the two new constants `PAINTING_MEASUREMENTS` and `SIDING_MEASUREMENTS` in `server/src/voice/voicePromptCompiler.js`. They explicitly ask separate surface facts, permit caller-confirmed best estimates, prevent duplicate direct/dimensional entry, explain opening conventions, and require the existing measurement disclaimer. Shared prompt paragraphs and the fence block are unchanged. No actual speech/provider session was exercised.

Additional product label: “Trim preparation materials”. Large-room opening rows are optional; their help is included above. Nested controls include their parent room number, so an opening remains visibly bound to its room. Direct painting area help explains whether supplied opening counts are still included.

When the owner has not selected a siding soffit unit, the quantity unit is “units (owner must confirm)”; no unit is guessed, and unpriced requested soffit is excluded. Entering a soffit price still requires an explicit Square feet or Linear feet owner choice. Nested confirmation text uses the same opening labels and numbers, with no raw JSON property names.
