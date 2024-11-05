
# NetCancer-Insight

Cancer is a complex disease shaped by protein-protein interactions (PPI). Modeling these interactions as networks helps uncover key hub proteins and driver genes within cancer. A strong computational tool is vital for visualizing, annotating, and comparing cancer PPI networks. Network analysis reveals genetic similarities and differences across cancers and identifies novel research and treatment targets. We present Net Cancer Insight, a tool offering detailed network visualizations and comprehensive analyses of cancer’s genetic landscape using specialized databases.



## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
  - [Dependencies](#dependencies)
- [Getting Started](#getting-started)
	- [Running the Program](#running-the-program)
	- [Inpit File Format](#input-file-format)
- [Features](#features)
- [Data Sources](#data-sources)
- [Navigation](#navigation)
- [Data Visualization](#data-visualization)
	- [Interactive Network Visualization](#interactive-network-visualization)
      - [Nodes](#nodes)
      - [Links](#links)
	- [Legend](#legend)
  - [Radar Chart](#radar-chart)
	- [Filter](#filter)
- [Comparative Analysis](#comparative-analysis)
- [Contact](#contact)

## Requirements

NetCancer-Insight requires React version of 18.2 or higher.
## Installation

Download this program and open it in an IDE that supports React-based applications like [Webstorm](https://www.jetbrains.com/webstorm/download/#section=mac).

### Dependencies 

This program these modules in order to run properly.

- [d3](https://www.npmjs.com/package/d3) (> v7.9.0)
- [recharts](https://www.npmjs.com/package/recharts) (> 2.12.7)

For more information of the dependencies of this program, please look at the `package.json` file

In order to install the necessary modules, in the terminal in your React based IDE, type the following:

```bash
  npm install
  npm start
```

This should generate a local server where the program can run. If you want to generate a local `index.html` file to run the program, simply type: 

```bash
  npm run build
```

This will create a `build` directory, where you can find an `index.html` file to click on.
## Getting Started

### Running the Program

After the dependencies have been installed, you can press the run button in your React-based IDE or simply type in the following command in the terminal of your IDE to run the program:

```bash
npm start
```

### Input File Format

NetCancer-Insight currently only supports two input data types:
a tsv file or a JSON file with a data structure that has each row representing an interaction of genes/proteins and the columns being named `source`, `target`, and the `weight`.

For more information and details on the specific support for input files, please look in the repository for test inputs in the `public/examples/inputs` folder.

## Features

- Interactive, colored graph representations of PPI networks
- Handles touch screen functionality like zoom and drag
- Provides data from reliable sources about the proteins/interactions in network
- Allows user to filter for proteins that match criteria
- Collapsible/Expandable panel to upload two networks
- Graph Theory Metrics for Networks
- Comparative Analysis Tab to compare two different networks


## Data Sources

In this program, we used trusted sources and databases such as OncoKB, Network of Cancer Genes (NCG), Reactome, GO terms, String, and cBioPortal, generating an interactive network graph, and performing additional network analysis to provide annotations and enable comparative analysis.
## Navigation

Use the navigation bar on top of the application screen to switch between different pages to get more information about the application. These include `Home` and `Analysis` page. 


## Data Visualization

### Interactive Network Visualization

Once you upload the input file, the program will generate an interactive network that depicts the connections in your input file visually. This network is user interactive, allowinng the user to move the nodes around, zoom in/out, and translating the network as well. 

#### Nodes

Nodes in the network represent the genes/proteins that were in the input file to the program. In the program, nodes are visually differentiated by the degree of the node and the how related a specific gene/protein is to different types of cancer. Larger nodes correspond to genes/proteins with a higher degree/more connections to other genes/proteins, while smaller nodes correspond to a fewer connections. The color of the node offers insight into the gene/protein's involvement in different cancers; where red indicates 3+ related cancers, orange indicates 1-3 related cancers, and gray indicates no related cancers.

Each node is also clickable. Once you click the node, it will show a side panel of information relating to that node that has been indexed in trusted database sources referenced in the [data sources](#data-sources). 

#### Links

Links in the network represent the connections between two distinct nodes. The distance of the links is influenced by the weight of the connection between the 2 nodes that was given in the input file. There are many different trusted and reliable sources that verify these interactions between genes/proteins that were inputted. The thickness of the links between two nodes corresponds to the number of sources where the specific link/connection was found. 

Each link is also clickable. Once you click a link between two nodes, it will show a side panel of information relating to where the specific link was found in the [data sources](#data-sources) that the program indexed.

### Legend

At the top of the application, there is a legend box that describes what each color of the nodes means. This legend gets updated as the colors of the nodes change based on file uploads or filters that are applied.

### Radar Chart

The program also provides the user grah theory metrics to describe a given interactive network. Currently, the program calculates 3 graph theory metrics to describe the network: graph density, centralization, and clustering coefficient. It provides a visual depiction of these metrics of a spider graph, allowing the user to read the value and get an overview of the network structure.

### Filter

In this program, the user is also able to filter for certain genes/proteins, keywords, and fetaures about the nodes. There are options to search for related cancers, cancer type, organ system, and primary site. If there is match for the query, then the prgram would highlight those specific nodes as yellow, indicating a match to your filter query, and update the legend box accordingly.
## Comparative Analysis

It is beneficial to also compare how different two protein-protein interaction networks are. This program offers functionality for the user to perfrom comparative analysis between two different networks.

Once you have uploaded one input file and have generated the interactive network visualization, you can simply press the button `New Panel` on the top left of the application to open a new panel screen on the application. You can still modify/manipulate the original network to better fit the screen or to perform more analysis. After the new panel has opened, you can follow the same process to upload a different input file following the [file format](#input-file-format).

This would generate another interactive network visualization where you can simultaneoulsy perform modifications and data analsyis on both of the networks. However, to perfrom cross-network analysis, simply press the button `Comparative Analysis`, to open up a new panel with more information. This new panel would give information on which proteins/genes are shared between both of the networks, the separation score of the networks, and an overlapped radar chart of both the network's graph theory metrics.


## Authors

This project was developed by `Abhinav Chede` and `Dr. Alper Uzun` in the Uzun Lab at Brown University. 

To report any bugs or issues, please contact alper_uzun@brown.edu.
