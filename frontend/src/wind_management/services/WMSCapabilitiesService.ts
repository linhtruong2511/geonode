import axios from 'axios';

export class WMSCapabilitiesService {
  /**
   * Fetch and parse WMS GetCapabilities to get available time dimensions for a layer
   * @param layerName e.g., 'geonode:u10m'
   * @returns array of ISO8601 time strings
   */
  static async fetchLayerTimes(layerName: string): Promise<string[]> {
    try {
      const response = await axios.get('/geoserver/wms', {
        params: {
          service: 'WMS',
          version: '1.1.1',
          request: 'GetCapabilities'
        }
      });
      
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(response.data, 'text/xml');
      
      // Find the Layer element matching the layerName
      const layers = xmlDoc.getElementsByTagName('Layer');
      for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        const nameNode = layer.getElementsByTagName('Name')[0];
        
        if (nameNode && nameNode.textContent === layerName) {
          // Check both Extent (WMS 1.1.1) and Dimension (WMS 1.3.0)
          const tagsToCheck = ['Extent', 'Dimension'];
          for (const tagName of tagsToCheck) {
            const elements = layer.getElementsByTagName(tagName);
            for (let j = 0; j < elements.length; j++) {
              const el = elements[j];
              if (el.getAttribute('name') === 'time') {
                const timeString = el.textContent;
                if (timeString) {
                  return timeString.split(',').map(t => t.trim());
                }
              }
            }
          }
        }
      }
      
      return [];
    } catch (error) {
      console.error('Failed to fetch WMS capabilities', error);
      return [];
    }
  }
}
