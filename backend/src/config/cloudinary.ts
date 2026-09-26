import { v2 as cloudinary } from "cloudinary";

const isCloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

export default cloudinary;

/** Upload helper used by student resume / avatar / certificate upload routes.
 * Gracefully uploads to Cloudinary if configured, or saves to base64 Data URL / local storage fallback.
 */
export async function uploadBuffer(buffer: Buffer, folder: string, resourceType: "image" | "raw" = "raw"): Promise<string> {
  if (isCloudinaryConfigured) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: `skillbridge-ai/${folder}`, resource_type: resourceType },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve(result.secure_url);
        }
      );
      stream.end(buffer);
    });
  }

  // Fallback when Cloudinary keys are not provided: store as Data URI
  const mimeType = resourceType === "image" ? "image/png" : "application/pdf";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}
