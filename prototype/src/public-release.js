export const publicReleaseVersion = "weather-global-1.0.0";

export function validPublicationState(value) {
  return value?.publication_allowed === false
    || (value?.publication_allowed === true
      && value.public_release?.version === publicReleaseVersion
      && typeof value.public_release.source_sha256 === "string"
      && /^[a-f0-9]{64}$/.test(value.public_release.source_sha256));
}
