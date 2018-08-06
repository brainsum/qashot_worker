# QAShot Worker

This repo contains code for the QAShot worker.
The QAShot worker project consists from multiple microservices to ensure speed and scalability.

## Setup
### Prerequisites
Docker and Docker-compose with docker-compose.yml v3 support.

*Note*: These are used by the main developer:

- Docker version 18.06.0-ce, build 0ffa825
- docker-compose version 1.22.0, build f46880f

*Note*: The helper scripts (e.g ```docker.startup.dev.sh```) were written and tested on Ubuntu 16.04

### How to install
- Clone the repo
- Copy ```.env.example``` as ```.env``` and update the keys for your environment
- Create a ```runtime``` folder in the project root
- Create a ```rabbitmq_data``` folder with ```user:group -> 1001:1001``` in the project root ```runtime``` folder
- (optional) Create a ```runtime``` folder in the ```backstopjs_worker``` folder
- Use ```docker.startup.dev.sh``` or ```docker.startup.prod.sh```
    - *Note*: Dev will build the docker images if not already present on the machine. This might take several minutes and use lots of resources.

## Components (custom)
### Frontend
@todo
### BackstopJS Worker
@todo

## Components (community)
### Traefik
We are using traefik as a load balancer/reverse proxy.

Access here: http://qashot-worker.docker.localhost:8080/dashboard/

## @todo
- Contribution
- Deployment
