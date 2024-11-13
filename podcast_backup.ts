import { parse as parseXml } from "https://deno.land/x/xml@2.1.1/mod.ts";
import { ensureDir } from "https://deno.land/std@0.208.0/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.208.0/path/mod.ts";

// Types for our podcast data
interface PodcastEpisode {
  title: string;
  guid: string;
  pubDate: string;
  duration: string;
  description: string;
  link: string;
  imageUrl: string;
  audioUrl: string;
  season?: number;
  episode?: number;
}

interface DownloadResult {
  success: boolean;
  error?: string;
}

// Function to sanitize filenames
function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

// Function to download a file
async function downloadFile(url: string, filepath: string): Promise<DownloadResult> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }
    
    const fileData = new Uint8Array(await response.arrayBuffer());
    await Deno.writeFile(filepath, fileData);
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Function to parse RSS feed and extract episode information
async function parseRSSFeed(xmlContent: string): Promise<PodcastEpisode[]> {
  const doc = await parseXml(xmlContent);
  const items = doc.rss.channel.item;
  
  return items.map((item: any) => {
    const episode: PodcastEpisode = {
      title: item.title,
      guid: item.guid['#text'] || item.guid,
      pubDate: item.pubDate,
      duration: item['itunes:duration'],
      description: item.description,
      link: item.link,
      imageUrl: item['itunes:image']?.['@href'] || '',
      audioUrl: item.enclosure['@url'],
      season: item['itunes:season'] ? parseInt(item['itunes:season']) : undefined,
      episode: item['itunes:episode'] ? parseInt(item['itunes:episode']) : undefined,
    };
    return episode;
  });
}

// Main function to process the podcast backup
async function backupPodcast(rssUrl: string, outputDir: string) {
  try {
    // Create output directories
    const audioDir = join(outputDir, 'audio');
    const imageDir = join(outputDir, 'images');
    const jsonDir = join(outputDir, 'json');
    
    await ensureDir(audioDir);
    await ensureDir(imageDir);
    await ensureDir(jsonDir);

    // Fetch and parse RSS feed
    const response = await fetch(rssUrl);
    const xmlContent = await response.text();
    const episodes = await parseRSSFeed(xmlContent);

    // Process each episode
    for (const episode of episodes) {
      console.log(`Processing episode: ${episode.title}`);
      
      const baseFilename = sanitizeFilename(episode.title);
      
      // Download audio file
      if (episode.audioUrl) {
        const audioPath = join(audioDir, `${baseFilename}.mp3`);
        const audioResult = await downloadFile(episode.audioUrl, audioPath);
        console.log(`Audio download ${audioResult.success ? 'successful' : 'failed'}: ${episode.title}`);
        if (!audioResult.success) {
          console.error(`Error downloading audio: ${audioResult.error}`);
        }
      }

      // Download image file
      if (episode.imageUrl) {
        const imageExt = episode.imageUrl.split('.').pop() || 'jpg';
        const imagePath = join(imageDir, `${baseFilename}.${imageExt}`);
        const imageResult = await downloadFile(episode.imageUrl, imagePath);
        console.log(`Image download ${imageResult.success ? 'successful' : 'failed'}: ${episode.title}`);
        if (!imageResult.success) {
          console.error(`Error downloading image: ${imageResult.error}`);
        }
      }

      // Save episode metadata as JSON
      const jsonPath = join(jsonDir, `${baseFilename}.json`);
      await Deno.writeTextFile(jsonPath, JSON.stringify(episode, null, 2));
      console.log(`JSON metadata saved: ${episode.title}`);
    }

    console.log('Backup completed successfully!');
  } catch (error) {
    console.error('Error during backup:', error instanceof Error ? error.message : String(error));
  }
}

// Execute the backup
const RSS_URL = "https://pinecast.com/feed/asostechpodcast";
const OUTPUT_DIR = "./podcast_backup";

if (import.meta.main) {
  await backupPodcast(RSS_URL, OUTPUT_DIR);
} 