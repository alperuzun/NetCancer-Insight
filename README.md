
# NetCancer-Insight

NetCancer-Insight is a robust computational tool for analyzing Protein-Protein Interaction (PPI) networks, focusing particularly on cancer-related genes.


## Features

- Interactive, colored graph representations of PPI networks
- Handles touch screen functionality like zoom and drag
- Provides data from reliable sources about the proteins/interactions in network
- Allows user to filter for proteins that match criteria
- Collapsible/Expandable panel to upload two networks
- Graph Theory Metrics for Networks
- Comparative Analysis Tab to compare two different networks


## Installation

Download this program and unzip it. Open the folder in a React based IDE with the following dependencies installed.

### Dependencies

- [d3](https://www.npmjs.com/package/d3) (> v7.9.0)
- [rehcarts](https://www.npmjs.com/package/recharts) (> 2.12.7)

For more information of the dependencies of this program, please look at the `package.json` file

#### Dependency Installation
In the terminal in your React based IDE, type the following:

```bash
  npm i d3
  npm i recharts
```
    
After the dependencies have been installed, you can press the run button or simply type in the following command to run the program:

```bash
npm start
```
## Usage/Examples

NetCancer-Insight currently only supports two input data types:
a tsv file or a JSON file with a data structure that has each row representing an interaction and the columns being the `soruce`, `target`, and the `weight`.

### Inputs

For more information and details on the specific support for input files, please look in the repository for test inputs in the `public/examples/inputs` folder.

### Analysis

NetCancer-Insight provides valuable qualitative and quantitative analysis of the networks. 

Qualitative Analysis:
The program inherently increases the size of protein hubs in the networks and distinctly colors proteins/genes that are closely associated with multiple types of cancer. 

Quantitative Analysis:
Certain graph theory metrics are calculated to describe the network and displayed in a radar chart. When two different networks have been uploaded, it will provide an overlayed radar chart comparing the metrics of both networks. It also computes a separation score which characterizes how distinct two networks are.


## Authors

- [@AbhinavChede](https://github.com/AbhinavChede)

To report any bugs or issues, please contact abhinav_chede@brown.edu. 

