// Import necessary objects from the Figma Plugin API
const { currentPage, closePlugin } = figma;

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
      #buttons {
        display: flex;
        justify-content: space-between;
        margin-bottom: 20px;
      }
    </style>
  </head>
  <body>
    <div id="buttons">
      <button id="getProperties">Get Properties</button>
      <button id="updateFromFigma">Update from Figma</button>
      <button id="updateFromInput">Update from Input</button>
    </div>
    <textarea id="jsonInput"></textarea>
    <div id="properties"></div>
    <script>
      const getPropertiesButton = document.getElementById('getProperties');
      const updateFromFigmaButton = document.getElementById('updateFromFigma');
      const updateFromInputButton = document.getElementById('updateFromInput');
      const jsonInput = document.getElementById('jsonInput');
      const propertiesDiv = document.getElementById('properties');

      getPropertiesButton.addEventListener('click', () => {
        parent.postMessage({ pluginMessage: { type: 'get-properties' } }, '*');
      });

      updateFromFigmaButton.addEventListener('click', () => {
        parent.postMessage({ pluginMessage: { type: 'update-from-figma' } }, '*');
      });

      updateFromInputButton.addEventListener('click', () => {
        const inputData = JSON.parse(jsonInput.value);
        parent.postMessage({ pluginMessage: { type: 'update-from-input', data: inputData } }, '*');
      });

      window.addEventListener('message', event => {
        const { pluginMessage } = event.data;
        if (pluginMessage.type === 'properties') {
          propertiesDiv.textContent = JSON.stringify(pluginMessage.data, null, 2);
        } else if (pluginMessage.type === 'error') {
          propertiesDiv.textContent = pluginMessage.message;
        }
      });
    </script>
  </body>
</html>
`;

// Show the plugin's UI
figma.showUI(html, { width: 400, height: 500 });

//languages
let languages = ["en", "de", "fr", "es", "it", "ja", "ko", "zh-CN"];

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

// Helper Counter function v2
//This version should now increment the counter only if the name is encountered before with a different block ID.
//If the name is encountered for the first time or with the same block ID, the counter remains the same.
function addCounter2(name, blockCounter, blockId) {
  console.log(`Adding to counter2: ${name}, ${blockId}`);
  if (blockCounter[name] === undefined) {
    blockCounter[name] = {
      blockIds: [blockId],
      count: 1
    };
  } else {
    if (!blockCounter[name].blockIds.includes(blockId)) {
      blockCounter[name].blockIds.push(blockId);
      blockCounter[name].count++;
    }
  }

  if (blockCounter[name].count > 1) {
    name += ` ${String(blockCounter[name].count).padStart(2, '0')}`;
  }

  console.log(`Counter2 after addition: ${JSON.stringify(blockCounter)}`);
  return name;
}

// Helper function to extract properties
function extractProperties(instance, properties, counter, blockCounter, blockName, blockId, path = []) {
  console.log(`Entering extractProperties with ${blockName}, ${blockId}`);

  if (instance.type === "TEXT" && !instance.locked) {
    let textProp = {};
    let layerName = instance.name;

    layerName = addCounter(layerName, counter);

    textProp["Block_id"] = blockId;
    textProp["layer_id"] = instance.id.split(';').pop();
    textProp["path"] = path;
    textProp["Block_name"] = blockName;
    textProp["layer_name"] = layerName;
    textProp["content"] = getTextContent(instance); // Adding this line
    properties.push(textProp);
  }

  if (instance.children && instance.children.length > 0) {
    for (let i = 0; i < instance.children.length; i++) {
      let child = instance.children[i];
      if (child.visible) {
        extractProperties(child, properties, counter, blockCounter, blockName, blockId, [...path, i]);
      }
    }
  }
}

// Initialize blockCounter outside of getInstanceProperties
let blockCounter = {};


// Main function
function getInstanceProperties(instance, languageFrames) {
  console.log(`Entering getInstanceProperties with instance id: ${instance.id}`);

  let properties = [];
  let counter = {};

  let blockName = instance.name;
  let blockId = instance.id.split(';').pop();

  blockName = addCounter2(blockName, blockCounter, blockId);

  extractProperties(instance, properties, counter, blockCounter, blockName, blockId);

  let propertyGroups = groupPropertiesByBlockId(properties);

  // Include the frame id for each language in the properties
  for (let blockName in propertyGroups) {
    let translations = languages.map(language => ({
      "Lang": language,
      "Block_id": languageFrames[language],
      "content": "" // add an empty content field for not ready translations
    }));
    propertyGroups[blockName].forEach(property => property.Translations = translations);
  }

  console.log(`Leaving getInstanceProperties with properties: ${JSON.stringify(properties)}`);
  return properties;
}

function groupPropertiesByBlockId(properties) {
  let groups = {};
  properties.forEach(prop => {
    if (!groups[prop.Block_name]) {
      groups[prop.Block_name] = [];
    }
    groups[prop.Block_name].push(prop);
  });
  return groups;
}

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

function cloneInstances(instances) {
  // The set of languages we want to generate translations for
  const languages = ['en', 'de', 'fr', 'es', 'it', 'ja', 'ko', 'zh-CN'];

  // Create new page with current date and time as the name
  const newPage = figma.createPage();
  newPage.name = `${new Date().toLocaleString()}`;

  let xPos = 0;
  let languageFrames = {};

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

    // Clone instances into the frame
    for (let instance of instances) {
      const newInstance = instance.clone();
      frame.appendChild(newInstance);
    }

    // Store the frame id
    languageFrames[language] = frame.id;

    // Update xPos for the next frame
    xPos += frame.width + 100; // Move the next frame to the right
  }

  // Return the id's of the frames for each language
  return languageFrames;
}

//stage 2
async function updateFromFigma(properties) {
  try {
    // Check if properties is not null or undefined before using it
    if (!properties) {
      console.error('Properties is undefined or null');
      return;
    }

    // Iterate over all properties
    for (let prop of properties) {
      console.log(`Processing property: ${prop.layer_name}`); // Debug message
      // For each property, iterate over all translations
      for (let translation of prop.Translations) {
        console.log(`Processing translation: ${translation.Lang}`); // Debug message
        // Get the corresponding frame for this translation's language
        let frameId = translation.Block_id;
        let frame = figma.getNodeById(frameId);

        if (frame) {
          console.log(`Found frame: ${frameId}`); // Debug message
          // Retrieve the text node at the given path
          let textNode = getTextNodeAtPath(frame, prop.path);
          if (textNode) {
            console.log(`Found text node at path: ${prop.path}`); // Debug message
            // If a text node was found, load its font and update the translation's content
            await figma.loadFontAsync(textNode.fontName);
            translation.content = textNode.characters;
            console.log(`Updated content: ${translation.content}`); // Debug message
          } else {
            console.log(`No text node found at path: ${prop.path}`); // Debug message
          }
        } else {
          console.log(`No frame found with ID: ${frameId}`); // Debug message
        }
      }
    }
  } catch (error) {
    console.error(`Failed to update from Figma: ${error.message}`);
  }

  // Send the updated properties back to the UI
  figma.ui.postMessage({ type: 'properties', data: properties });
}

function getTextNodeAtPath(node, path) {
  let child = node;
  for (let index of path) {
    console.log(`Current child: ${JSON.stringify(child.name)}`); // Debug message
    if (child.children && child.children.length > index) {
      child = child.children[index];
    } else {
      console.log('Path leads to non-existing child'); // Debug message
      return null;
    }
  }

  console.log(`Final child: ${JSON.stringify(child.name)}`); // Debug message
  if (child.type === "TEXT") {
    return child;
  }

  console.log('Final child is not a text node'); // Debug message
  return null;
}

//
// Define languageFrames in higher scope
let languageFrames = null;


figma.ui.onmessage = async msg => {
  if (msg.type === 'update-from-figma') {
    console.log('Received update-from-figma message'); // Debug message
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

    // Recalculate languageFrames if necessary
    languageFrames = languageFrames || cloneInstances(instances);

    let properties = instances.map(instance => getInstanceProperties(instance, languageFrames));

    console.log(`Properties: ${JSON.stringify(properties, null, 2)}`); // Debug message

    // This is where you make the change
    let flattenedProperties = properties.flat();
    try {
      // Update properties from Figma
      await updateFromFigma(flattenedProperties);
    } catch (error) {
      console.error(`Failed to handle 'update-from-figma' message: ${error.message}`);
    }

  } else if (msg.type === 'get-properties') {
    // Reset the counter and blockCounter here
    blockCounter = {};

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

    // Clone the instances for each language and get the frame id's
    languageFrames = cloneInstances(instances);

    // Retrieve the properties of these instances
    let properties = instances.map(instance => getInstanceProperties(instance, languageFrames));

    // Send the properties and frame id's back to the UI
    figma.ui.postMessage({ type: 'properties', data: properties, languageFrames: languageFrames });

    // This is where you make the second change
    let flattenedProperties = properties.flat();
    try {
      // Update properties from Figma
      await updateFromFigma(flattenedProperties);
    } catch (error) {
      console.error(`Failed to handle 'get-properties' message: ${error.message}`);
    }

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
};