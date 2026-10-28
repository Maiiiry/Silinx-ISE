In detail:
- The ISE runner: the agent that lets the runner's user reach Docker Desktop's socket (`install.sh --docker-acl`) waits for the socket before setting its ACL, and runs every 5 minutes too. After a restart of Docker Desktop it ran while the socket was gone, the socket came back without the ACL, and the nightly's ISE job was refused Docker (#1799).
