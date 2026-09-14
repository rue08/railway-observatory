const swaggerJsdoc = require("swagger-jsdoc");
const path = require("path");
const { version } = require("../../package.json");

// Builds the OpenAPI document from the `@openapi` JSDoc blocks living above
// each route handler in src/routes/*.js — swagger-jsdoc only reads those
// files as text (glob + regex extraction), it never requires/executes them,
// so generating this spec never touches Prisma, Redis, or anything stateful.
const spec = swaggerJsdoc({
  definition: {
    openapi: "3.1.0",
    info: {
      title: "railway-observatory",
      version,
      description: "Railway Delay Intelligence Platform API — see PROJECT.md",
    },
    // Applies to every operation unless a route overrides it with its own
    // `security: []` (see health.js) — matches apiKeyAuth.js's actual
    // behavior: everything requires X-API-Key except /health (and /docs,
    // /openapi.json themselves, which aren't part of this spec at all).
    security: [{ ApiKeyAuth: [] }],
    // Shared response shapes, mirroring prisma/schema.prisma. Kept here
    // rather than scattered across route JSDoc blocks so every route
    // references the same schema instead of redefining it.
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
        },
      },
      schemas: {
        Station: {
          type: "object",
          properties: {
            id: { type: "string", example: "clx0a1b2c0000qzrm5g8h1a2b" },
            code: { type: "string", example: "NDLS" },
            name: { type: "string", example: "New Delhi" },
            latitude: { type: "number", nullable: true },
            longitude: { type: "number", nullable: true },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Train: {
          type: "object",
          properties: {
            id: { type: "string", example: "clx0a1b2c0000qzrm5g8h1a2b" },
            number: { type: "string", example: "12301" },
            name: { type: "string", example: "Howrah Rajdhani" },
            runDays: {
              type: "array",
              items: { type: "string" },
              example: ["mon", "tue", "thu", "fri"],
            },
            destinationCode: {
              type: "string",
              nullable: true,
              description: "RailRadar's train.destination.code. Null for trains imported before this field existed, until re-imported.",
              example: "JU",
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        TrainRun: {
          type: "object",
          properties: {
            id: { type: "string" },
            trainId: { type: "string" },
            serviceDate: { type: "string", format: "date" },
            status: { type: "string", enum: ["SCHEDULED", "RUNNING", "COMPLETED", "CANCELLED"] },
            sourceProvider: { type: "string", example: "railradar" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        StationVisit: {
          type: "object",
          properties: {
            id: { type: "string" },
            station: { $ref: "#/components/schemas/Station" },
            sequenceNumber: { type: "integer" },
            scheduledArrivalAt: { type: "string", format: "date-time", nullable: true },
            scheduledDepartureAt: { type: "string", format: "date-time", nullable: true },
            actualArrivalAt: { type: "string", format: "date-time", nullable: true },
            actualDepartureAt: { type: "string", format: "date-time", nullable: true },
            arrivalDelayMinutes: { type: "integer", nullable: true },
            departureDelayMinutes: { type: "integer", nullable: true },
            visibilityMeters: { type: "integer", nullable: true },
            weatherCondition: {
              type: "string",
              nullable: true,
              description: "Raw OpenWeatherMap weather[0].main category (\"Rain\", \"Fog\", \"Clear\", ...) at the same observation.",
              example: "Fog",
            },
            primaryReasonTag: { type: "string", nullable: true },
            loggedAt: { type: "string", format: "date-time" },
          },
        },
        NewsEvent: {
          type: "object",
          properties: {
            id: { type: "string" },
            sourceUrl: { type: "string", format: "uri" },
            title: { type: "string" },
            sourceOutlet: { type: "string", nullable: true },
            publishedAt: { type: "string", format: "date-time" },
            trustTier: { type: "string", example: "established-outlet" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        NewsEventMatch: {
          type: "object",
          properties: {
            id: { type: "string" },
            newsEventId: { type: "string" },
            stationVisitId: { type: "string" },
            matchedOn: { type: "string", enum: ["trainNumber", "stationName"] },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        DelayAttribution: {
          type: "object",
          properties: {
            id: { type: "string" },
            stationVisitId: { type: "string" },
            primaryReasonTag: {
              type: "string",
              nullable: true,
              description: "A genuine cause (weather/maintenance/congestion/accident/disruption), never news-corroboration.",
            },
            confidenceTier: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
            totalScore: { type: "integer" },
            computedAt: { type: "string", format: "date-time" },
          },
        },
        DelayAttributionReason: {
          type: "object",
          properties: {
            id: { type: "string" },
            delayAttributionId: { type: "string" },
            reason: {
              type: "string",
              description: "weather | maintenance | congestion | accident | disruption | news-corroboration",
            },
            score: { type: "integer" },
            source: { type: "string", enum: ["weather-snapshot", "news"] },
            matchType: { type: "string", nullable: true, enum: ["trainNumber", "stationName", null] },
            detail: { type: "string" },
          },
        },
        RouteStation: {
          type: "object",
          properties: {
            id: { type: "string" },
            trainId: { type: "string" },
            stationId: { type: "string" },
            sequenceNumber: { type: "integer", example: 1 },
            arrivalDayOffset: { type: "integer", nullable: true },
            departureDayOffset: { type: "integer", nullable: true },
            scheduledArrivalTime: {
              type: "integer",
              nullable: true,
              description: "Minutes since midnight",
            },
            scheduledDepartureTime: {
              type: "integer",
              nullable: true,
              description: "Minutes since midnight",
            },
            station: { $ref: "#/components/schemas/Station" },
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
        },
      },
    },
  },
  apis: [path.join(__dirname, "../routes/*.js")],
});

module.exports = spec;
