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
//Helper Counter function
function addCounter(name, counter) {
  if (counter[name] !== undefined && counter[name] >= 1) {
    counter[name] = counter[name] + 1;
    name += ` ${String(counter[name]).padStart(2, '0')}`;
  } else {
    counter[name] = 1;
  }
  return name;
}

// Helper function to extract properties
function extractProperties(instance, properties, counter, blockName, blockId, path = []) {
  if (instance.type === "TEXT" && !instance.locked) {
    let textProp = {};
    let layerName = instance.name;

    // Add counter to block name and layer name
    blockName = addCounter(blockName, counter);
    layerName = addCounter(layerName, counter);

    textProp["Block_id"] = blockId; // The block ID is passed down during recursion
    textProp["layer_id"] = instance.id.split(';').pop(); // Store the instance's ID
    textProp["path"] = path; // Store the path to this node
    textProp["Block_name"] = blockName;
    textProp["layer_name"] = layerName;
    textProp["en"] = instance.characters;
    textProp["de"] = "";
    textProp["fr"] = "";
    textProp["es"] = "";
    textProp["it"] = "";
    textProp["ja"] = "";
    textProp["ko"] = "";
    textProp["zh-CN"] = "";
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

// Helper function to find all instances inside a node
function findAllInstances(node) {
  let instances = [];

  if ('children' in node) {
    for (let child of node.children) {
      if (child.type === "INSTANCE") {
        instances.push(child);
      } else {
        instances = instances.concat(findAllInstances(child));
      }
    }
  }

  return instances;
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

async function processBlock(objs, frame, language) {
  const block_id = objs[0].Block_id;

  // Get the instance corresponding to the block_id
  const instance = figma.getNodeById(block_id);
  if (!instance || instance.type !== 'INSTANCE') {
    console.log(`No instance found or not an instance type for Block_id: ${block_id}`);
    return;
  }

  // Create a new instance
  const newInstance = instance.clone();
  frame.appendChild(newInstance);

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
        child.characters = obj[language];
        console.log(`Finished replacing text, new text: ${child.characters}`);
      } catch (error) {
        console.log(`Error while replacing text: `, error);
      }
    }
  }
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

    // Find all instances inside each selected node
    let instances = [];
    for (let node of selectedNodes) {
      instances = instances.concat(findAllInstances(node));
    }

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
    console.log(postDataJson.replace(/’/g, "'"));
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

    // The set of languages we want to generate translations for
    const languages = ['de', 'fr', 'es', 'it', 'ja', 'ko', 'zh-CN', 'en'];

    // Create new page with current date and time as the name
    const newPage = figma.createPage();
    newPage.name = `${new Date().toLocaleString()}`;

    let xPos = 0;

    for (let language of languages) {
      // Generate new frame with language as the name
      const frame = figma.createFrame();
      frame.name = language;
      frame.layoutMode = "VERTICAL"; // set layout mode
      frame.primaryAxisAlignItems = "MIN";
      frame.counterAxisAlignItems = "CENTER"; // set counter alignment
      frame.itemSpacing = 0; // set item spacing
      frame.counterAxisSizingMode = 'AUTO';
      frame.primaryAxisSizingMode = 'AUTO';
      frame.x = xPos; // Set the frame's x position
    
      newPage.appendChild(frame); // append frame to the new page
    
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
        await processBlock(objs, frame, language);
      }
    
      // Update xPos for the next frame
      figma.root.setRelaunchData({relaunch: ''})
      frame.x = xPos; 
      xPos += frame.width + 100; // Move the next frame to the right
    }
  }
};

