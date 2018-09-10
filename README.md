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
- Create an ```internal_rabbitmq_data``` folder with ```user:group -> 1001:1001``` in the project root ```runtime``` folder
- Copy ```monitoring/alertmanager/config.example.yml``` as ```monitoring/alertmanager/config.yml``` and update the values
- Use the ```docker.deploy.prod.sh``` script
    - *Note*: This is going to rebuild the images. This might take several minutes and use lots of resources.
        - This is going to change once the stack is in an actual prod-ready state. Then, the building of the images will be handled by a CI/CD platform.
    - *Note*: Although the source code will be available on the host, it is going to be built into the images. This means, unless the stack is restarted with the ```docker.restart.dev.sh``` script, changing the code on host is not going to do anything.
    - *Note*: Starting with dev requires ```nodemon``` to be installed. This is a dev dependency that's not available in the image, so you have to manually edit the ```docker-compose.dev.yml``` command option or use ```npm install``` locally so it gets mounted to the image.

## Components (custom)
### Frontend
@todo
### BackstopJS Worker
@todo
### BackstopJS Firefox Worker
For some reason BackstopJS 3.5.2 does not work properly when using SlimerJS.
This means, for the tool to work, we need to use older versions and xvfb.
This is only a temporary solution, but should work for now.
Current version for backstop: 3.0.26

## Components (community)
### Traefik
We are using traefik as a load balancer/reverse proxy.

Access here: http://qashot-worker.docker.localhost:8080/dashboard/

## @todo
- Contribution
- Deployment
