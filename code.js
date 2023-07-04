// Import necessary objects from the Figma Plugin API
const { currentPage, closePlugin } = figma;

// Function to retrieve the content of text nodes
function getTextContent(node) {
  // Check if the node is a TextNode
  if ("characters" in node) {
    // Return the content of the TextNode
    return node.characters;
  }
  // If the node is not a TextNode, return null
  return null;
}

// Helper function to extract properties
function extractProperties(instance, properties, counter, blockName, blockId, path = []) {
  if (instance.type === "TEXT") {
    let textProp = {};
    let layerName = instance.name;

    if (counter[layerName] !== undefined && counter[layerName] >= 1) {
      counter[layerName] = counter[layerName] + 1;
      layerName += ` ${String(counter[layerName]).padStart(2, '0')}`;
    } else {
      counter[layerName] = 1;
    }

    textProp["Block_name"] = blockName;
    textProp["Block_id"] = blockId; // The block ID is passed down during recursion
    textProp["layer_id"] = instance.id.split(';').pop(); // Store the instance's ID
    textProp["layer_name"] = layerName;
    textProp["figma_text"] = instance.characters;
    textProp["path"] = path; // Store the path to this node
    textProp["de"] = "de";
    textProp["fr"] = "fr";
    textProp["es"] = "es";
    textProp["it"] = "it";
    textProp["ja"] = "ja";
    textProp["ko"] = "ko";
    textProp["zh-CN"] = "zh-CN";
    properties.push(textProp);
  }

  if (instance.children && instance.children.length > 0) {
    for (let i = 0; i < instance.children.length; i++) {
      let child = instance.children[i];
      if (child.visible) {
        // When recursing, append the child's index to the path
        extractProperties(child, properties, counter, blockName, blockId, [...path, i]);
      }
    }
  }
}

// Main function
function getInstanceProperties(instance) {
  console.log("Selected instance: ", instance); // Log the instance structure
  let properties = [];
  let counter = {};

  // Pass instance name and ID here
  extractProperties(instance, properties, counter, instance.name, instance.id.split(';').pop());

  return properties;
}




// Here is the UI html content
const html = `
  <!DOCTYPE html>
  <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
        }
        #properties {
          margin-top: 20px;
          white-space: pre-wrap;
        }
        #jsonInput {
          width: 100%;
          height: 150px;
        }
      </style>
    </head>
    <body>
      <button id="getProperties">Get Properties</button>
      <textarea id="jsonInput" placeholder="Paste the JSON with translations here..."></textarea>
      <button id="generate">Generate</button>
      <div id="properties"></div>
      <script>
        document.getElementById('getProperties').onclick = function() {
          parent.postMessage({pluginMessage: {type: 'get-properties'}}, '*');
        };
        document.getElementById('generate').onclick = function() {
          parent.postMessage({pluginMessage: {type: 'generate', json: document.getElementById('jsonInput').value}}, '*');
        };
        window.onmessage = function(event) {
          if (event.data.pluginMessage.type === 'properties') {
            document.getElementById('properties').textContent = JSON.stringify(event.data.pluginMessage.data, null, 2);
          } else if (event.data.pluginMessage.type === 'error') {
            document.getElementById('properties').textContent = event.data.pluginMessage.message;
          }
        };
      </script>
    </body>
  </html>
`;

// Show the plugin's UI
figma.showUI(html, { width: 400, height: 500 });

async function processBlock(objs, yPos, newPage) {
  const block_id = objs[0].Block_id;

  // Get the instance corresponding to the block_id
  const instance = figma.getNodeById(block_id);
  if (!instance || instance.type !== 'INSTANCE') {
    console.log(`No instance found or not an instance type for Block_id: ${block_id}`);
    return yPos;
  }

  // Create a new instance
  const newInstance = instance.clone();
  newInstance.y = yPos;
  newPage.appendChild(newInstance);

  // Increment the y position for the next instance
  yPos += newInstance.height;

  for (let obj of objs) {
    console.log(`Processing object with Block_id: ${obj.Block_id}`);
    // Go through the path to find the specific child
    console.log(`Starting path traversal for text replacement in layer: ${obj.layer_name}`);
    let child = newInstance;
    for (let i = 0; i < obj.path.length; i++) {
      console.log(`Attempting to access child at path: [${obj.path.slice(0, i + 1).join(', ')}]`);
      child = child.children[obj.path[i]];
    }

    console.log(`Finished path traversal, child status: `, child);

    // Check if the child node is a TextNode
    if (child.type === "TEXT") {
      console.log(`Replacing text in TextNode with ID: ${child.id}`);
      try {
        // Load the font
        await figma.loadFontAsync(child.fontName);
        // Replace the text
        child.characters = obj.de;
        console.log(`Finished replacing text, new text: ${child.characters}`);
      } catch (error) {
        console.log(`Error while replacing text: `, error);
      }
    }
  }

  return yPos;
}

figma.ui.onmessage = async msg => {
  // Check if the message is of type 'get-properties'
  if (msg.type === 'get-properties') {
    // Retrieve the currently selected nodes on the page
    let selectedNodes = currentPage.selection;

    // Check if there are selected nodes
    if (selectedNodes.length === 0) {
      figma.ui.postMessage({ type: 'error', message: 'No nodes selected.' });
      return;
    }

    // Filter for nodes of type "INSTANCE"
    let instances = selectedNodes.filter(node => node.type === "INSTANCE");

    // Check if there are selected instances
    if (instances.length === 0) {
      figma.ui.postMessage({ type: 'error', message: 'No instances selected.' });
      return;
    }

    // Retrieve the properties of these instances
    let properties = instances.map(getInstanceProperties);

    // Send the properties back to the UI
    figma.ui.postMessage({ type: 'properties', data: properties });

    // Flatten the array of properties
    let flattenedProperties = [].concat(...properties);

    // Prepare the data for the POST request
    const postData = {
      properties: flattenedProperties,
    };

    // Convert your data to JSON
    let postDataJson = JSON.stringify(postData);

    // Log the JSON data
    console.log("Sending the following JSON data:");
    console.log(postDataJson);
  }
  // Check if the message is a request to generate translated instances
  else if (msg.type === 'generate') {
    // Validate JSON input
    let data;
    try {
      data = JSON.parse(msg.json);
    } catch (error) {
      figma.notify('Invalid JSON');
      return;
    }

    // Generate new page with current date and time as the name
    const newPage = figma.createPage();
    newPage.name = new Date().toLocaleString();

    // Set the starting x position for the first instance
    let yPos = 0;

    // Group data by block_id
    let groupedData = [];
    data.reduce(function (res, value) {
      if (!res[value.Block_id]) {
        res[value.Block_id] = [];
        groupedData.push(res[value.Block_id])
      }
      res[value.Block_id].push(value);
      return res;
    }, {});

    // Loop through the groupedData
    for (let objs of groupedData) {
      yPos = await processBlock(objs, yPos, newPage);
    }
  }
};

