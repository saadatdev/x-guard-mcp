import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { guarded, UserFacingError } from '../x/client.js';
import { run } from './result.js';

const MB = 1024 * 1024;
const TYPES: Record<string, { mime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'; maxBytes: number }> = {
  '.png': { mime: 'image/png', maxBytes: 5 * MB },
  '.jpg': { mime: 'image/jpeg', maxBytes: 5 * MB },
  '.jpeg': { mime: 'image/jpeg', maxBytes: 5 * MB },
  '.webp': { mime: 'image/webp', maxBytes: 5 * MB },
  '.gif': { mime: 'image/gif', maxBytes: 15 * MB },
};

export function registerUploadMedia(server: McpServer): void {
  server.registerTool(
    'upload_media',
    {
      title: 'Upload an image',
      description:
        'Upload a local png/jpg/gif/webp (images ≤5 MB, GIF ≤15 MB) and get a media_id to pass to create_post. ' +
        'Add alt_text describing the image for accessibility. Uploading does not post anything.',
      inputSchema: {
        file_path: z.string().min(1).describe('Absolute local path'),
        alt_text: z.string().max(1000).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ file_path, alt_text }) =>
      run(async () => {
        if (!path.isAbsolute(file_path)) throw new UserFacingError(`file_path must be absolute, got "${file_path}".`);
        const type = TYPES[path.extname(file_path).toLowerCase()];
        if (!type) throw new UserFacingError('Only .png, .jpg, .jpeg, .gif and .webp files are supported.');
        let stat: fs.Stats;
        try {
          stat = fs.statSync(file_path);
        } catch {
          throw new UserFacingError(`File not found: ${file_path}`);
        }
        if (!stat.isFile()) throw new UserFacingError(`Not a file: ${file_path}`);
        if (stat.size > type.maxBytes) {
          throw new UserFacingError(`File is ${(stat.size / MB).toFixed(1)} MB; the limit for ${type.mime} is ${type.maxBytes / MB} MB.`);
        }

        const buffer = fs.readFileSync(file_path);
        const mediaId = await guarded(
          (x) => x.v2.uploadMedia(buffer, { media_type: type.mime, media_category: type.mime === 'image/gif' ? 'tweet_gif' : 'tweet_image' }),
          { tool: 'upload_media', endpoint: 'POST /2/media/upload', kind: 'media_upload', plan: { cost: 0 }, units: () => 1, write: true },
        );
        if (alt_text?.trim()) {
          await guarded((x) => x.v2.createMediaMetadata(mediaId, { alt_text: { text: alt_text.trim() } }), {
            tool: 'upload_media',
            endpoint: 'POST /2/media/metadata',
            kind: 'media_upload',
            plan: { cost: 0 },
            units: () => 1,
            write: true,
          });
        }
        return (
          `Uploaded ${path.basename(file_path)} → media_id: ${mediaId}` +
          (alt_text?.trim() ? ' (alt text set)' : ' (no alt text — consider adding one)') +
          '\nPass it to create_post as media_ids. Nothing has been posted.'
        );
      }),
  );
}
