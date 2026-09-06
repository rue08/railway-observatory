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
    // Shared response shapes, mirroring prisma/schema.prisma. Kept here
    // rather than scattered across route JSDoc blocks so every route
    // references the same schema instead of redefining it.
    components: {
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
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
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
            loggedAt: { type: "string", format: "date-time" },
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
