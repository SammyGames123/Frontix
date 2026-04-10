import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { getServerConfigFromServer } from "../core/configuration/ConfigLoader";

const config = getServerConfigFromServer();

export function getOtelResource() {
  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "frontix",
    [ATTR_SERVICE_VERSION]: "1.0.0",
    ...getPromLabels(),
  });
}

export function getPromLabels() {
  return {
    "service.instance.id": process.env.HOSTNAME,
    "frontix.environment": config.env(),
    "frontix.host": process.env.HOST,
    "frontix.domain": process.env.DOMAIN,
    "frontix.subdomain": process.env.SUBDOMAIN,
    "frontix.component": process.env.WORKER_ID
      ? "Worker " + process.env.WORKER_ID
      : "Master",
  };
}
